import { and, asc, desc, eq, inArray, isNull } from 'drizzle-orm';
import { db, schema } from '#lib/server/db/index.js';
import { generateId } from '#lib/server/utils.js';
import { t, type Locale } from '#lib/i18n/index.js';
import { MAX_NOTE_LEN } from '#lib/textLimits.js';
import { exceedsLen, parseFormTimestamp, type FormParse } from '#lib/server/validation.js';
import { deleteMediaBlobs, type StoredMediaRef } from '#lib/server/storage/media-blobs.js';
import { currentSeverity, parseSeverity } from '#lib/incidents.js';
import type { OpenIncidentSummary, Severity } from '#lib/incidents.js';

export interface IncidentInput {
	title: string;
	notes: string | null;
	occurredAt: Date;
	severity: Severity | null;
}

export interface IncidentUpdateInput {
	body: string;
	severity: Severity | null;
	occurredAt: Date;
}

export type IncidentRow = typeof schema.healthEvents.$inferSelect & { type: 'incident' };

const isIncident = (companionId: string, id: string) =>
	and(
		eq(schema.healthEvents.id, id),
		eq(schema.healthEvents.companionId, companionId),
		eq(schema.healthEvents.type, 'incident')
	);

// Pure inserts and scoped updates. Permission and shift checks belong to the
// caller (route guards, API guards), as with createHealthEvent.
export async function createIncident(
	companionId: string,
	input: IncidentInput,
	loggedBy: string | null
): Promise<string> {
	const id = generateId(15);
	await db
		.insert(schema.healthEvents)
		.values({ id, companionId, type: 'incident', ...input, loggedBy });
	return id;
}

export async function getIncident(
	companionId: string,
	id: string
): Promise<IncidentRow | undefined> {
	const row = await db.query.healthEvents.findFirst({ where: isIncident(companionId, id) });
	return row as IncidentRow | undefined;
}

export async function updateIncidentOverview(
	companionId: string,
	id: string,
	input: IncidentInput
): Promise<boolean> {
	const rows = await db
		.update(schema.healthEvents)
		.set(input)
		.where(isIncident(companionId, id))
		.returning({ id: schema.healthEvents.id });
	return rows.length > 0;
}

export async function setIncidentResolved(
	companionId: string,
	id: string,
	resolvedAt: Date | null
): Promise<boolean> {
	const rows = await db
		.update(schema.healthEvents)
		.set({ resolvedAt })
		.where(isIncident(companionId, id))
		.returning({ id: schema.healthEvents.id });
	return rows.length > 0;
}

export async function createIncidentUpdate(
	incidentId: string,
	input: IncidentUpdateInput,
	loggedBy: string | null
): Promise<string> {
	const id = generateId(15);
	await db
		.insert(schema.healthEventUpdates)
		.values({ id, healthEventId: incidentId, ...input, loggedBy });
	return id;
}

export async function getIncidentUpdate(incidentId: string, updateId: string) {
	return db.query.healthEventUpdates.findFirst({
		where: and(
			eq(schema.healthEventUpdates.id, updateId),
			eq(schema.healthEventUpdates.healthEventId, incidentId)
		)
	});
}

/** Without `occurredAt` the update keeps its time. */
export async function editIncidentUpdate(
	incidentId: string,
	updateId: string,
	input: Omit<IncidentUpdateInput, 'occurredAt'> & { occurredAt?: Date }
): Promise<boolean> {
	const rows = await db
		.update(schema.healthEventUpdates)
		.set(input)
		.where(
			and(
				eq(schema.healthEventUpdates.id, updateId),
				eq(schema.healthEventUpdates.healthEventId, incidentId)
			)
		)
		.returning({ id: schema.healthEventUpdates.id });
	return rows.length > 0;
}

// Same read-then-cascade shape as deleteNote: the media keys are read and the
// update deleted in one immediate transaction so an upload can't slip a row in
// between. Objects are removed after commit.
export async function deleteIncidentUpdate(incidentId: string, updateId: string): Promise<boolean> {
	const { deleted, media } = db.transaction(
		(tx): { deleted: boolean; media: StoredMediaRef[] } => {
			const media = tx
				.select({
					provider: schema.media.provider,
					storageKey: schema.media.storageKey,
					originalKey: schema.media.originalKey,
					posterKey: schema.media.posterKey
				})
				.from(schema.media)
				.innerJoin(
					schema.healthEventUpdates,
					eq(schema.healthEventUpdates.id, schema.media.updateId)
				)
				.where(
					and(
						eq(schema.media.updateId, updateId),
						eq(schema.healthEventUpdates.healthEventId, incidentId)
					)
				)
				.all();
			const rows = tx
				.delete(schema.healthEventUpdates)
				.where(
					and(
						eq(schema.healthEventUpdates.id, updateId),
						eq(schema.healthEventUpdates.healthEventId, incidentId)
					)
				)
				.returning({ id: schema.healthEventUpdates.id })
				.all();
			return { deleted: rows.length > 0, media: rows.length > 0 ? media : [] };
		},
		{ behavior: 'immediate' }
	);
	if (media.length > 0) await deleteMediaBlobs(media, 'incident-media');
	return deleted;
}

export async function listOpenIncidents(companionIds: string[]): Promise<OpenIncidentSummary[]> {
	if (companionIds.length === 0) return [];
	const incidents = await db
		.select()
		.from(schema.healthEvents)
		.where(
			and(
				inArray(schema.healthEvents.companionId, companionIds),
				eq(schema.healthEvents.type, 'incident'),
				isNull(schema.healthEvents.resolvedAt)
			)
		)
		.orderBy(desc(schema.healthEvents.occurredAt));
	if (incidents.length === 0) return [];
	const updates = await db
		.select()
		.from(schema.healthEventUpdates)
		.where(
			inArray(
				schema.healthEventUpdates.healthEventId,
				incidents.map((i) => i.id)
			)
		)
		// Ties on occurredAt resolve by creation order, which currentSeverity
		// relies on (later element wins).
		.orderBy(asc(schema.healthEventUpdates.occurredAt), asc(schema.healthEventUpdates.createdAt));
	const byIncident = new Map<string, (typeof updates)[number][]>();
	for (const u of updates) {
		const list = byIncident.get(u.healthEventId) ?? [];
		list.push(u);
		byIncident.set(u.healthEventId, list);
	}
	return incidents.map((i) => {
		const ups = byIncident.get(i.id) ?? [];
		const latest = ups.at(-1) ?? null;
		const lastActivityMs = Math.max(
			i.occurredAt.getTime(),
			...ups.map((u) => u.occurredAt.getTime())
		);
		return {
			id: i.id,
			companionId: i.companionId,
			title: i.title,
			occurredAt: i.occurredAt,
			currentSeverity: currentSeverity(i, ups),
			lastActivityAt: new Date(lastActivityMs),
			latestUpdate: latest ? { body: latest.body, occurredAt: latest.occurredAt } : null
		};
	});
}

/** Fields: title, notes, severity, occurredAt. Without allowStart the start is now. */
export function parseIncidentForm(
	data: FormData,
	locale: Locale,
	opts: { allowStart: boolean }
): FormParse<IncidentInput> {
	const title = String(data.get('title') ?? '').trim();
	const notes = String(data.get('notes') ?? '').trim();
	if (!title) return { ok: false, message: t(locale, 'error.titleRequired') };
	if ([title, notes].some((v) => exceedsLen(v, MAX_NOTE_LEN)))
		return { ok: false, message: t(locale, 'error.fieldTooLong', { max: MAX_NOTE_LEN }) };
	const occurredAt = opts.allowStart ? parseFormTimestamp(data.get('occurredAt')) : new Date();
	if (!occurredAt) return { ok: false, message: t(locale, 'error.invalidDateTime') };
	return {
		ok: true,
		value: {
			title,
			notes: notes || null,
			occurredAt,
			severity: parseSeverity(String(data.get('severity') ?? ''))
		}
	};
}

/** Fields: body, severity, occurredAt. Without allowTime the time is now. */
export function parseIncidentUpdateForm(
	data: FormData,
	locale: Locale,
	opts: { allowTime: boolean }
): FormParse<IncidentUpdateInput> {
	const body = String(data.get('body') ?? '').trim();
	if (!body) return { ok: false, message: t(locale, 'error.updateBodyRequired') };
	if (exceedsLen(body, MAX_NOTE_LEN))
		return { ok: false, message: t(locale, 'error.fieldTooLong', { max: MAX_NOTE_LEN }) };
	const occurredAt = opts.allowTime ? parseFormTimestamp(data.get('occurredAt')) : new Date();
	if (!occurredAt) return { ok: false, message: t(locale, 'error.invalidDateTime') };
	return {
		ok: true,
		value: { body, severity: parseSeverity(String(data.get('severity') ?? '')), occurredAt }
	};
}
