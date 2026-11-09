import { and, asc, count, eq, isNull } from 'drizzle-orm';
import { db, schema } from '#lib/server/db/index.js';
import type { Media } from '#lib/server/db/schema.js';
import { MEDIA_ITEM_COLUMNS, WITH_LOGGER } from '#lib/server/media-columns.js';
import { toMediaItem, type MediaItem, type MediaStatus } from '#lib/media.js';
import type { MessageKey } from '#lib/i18n/index.js';
import { getIncident } from '#lib/server/incidents.js';
import { isAssigned } from '#lib/server/media-access.js';
import { STORAGE_BACKEND } from '#lib/server/storage/index.js';
import { deleteMediaBlobs, storeThenInsert } from '#lib/server/storage/media-blobs.js';
import type { PreparedMedia } from '#lib/server/storage/media-upload.js';

// Incident media. Rows always carry healthEventId = the incident; updateId is
// null for overview photos and the update's id for update photos. Pure data
// access plus the upload commit; the incident media endpoint runs
// assertCanWriteIncident first.

export type IncidentMediaOutcome = 'ok' | 'gone' | 'cap';

export function incidentMediaKey(
	companionId: string,
	incidentId: string,
	filename: string
): string {
	return `health/${companionId}/${incidentId}/${filename}`;
}

const MEDIA_ORDER = [asc(schema.media.createdAt), asc(schema.media.id)];

export async function listIncidentMedia(
	incidentId: string
): Promise<{ overview: MediaItem[]; byUpdate: Map<string, MediaItem[]> }> {
	const rows = await db.query.media.findMany({
		where: eq(schema.media.healthEventId, incidentId),
		columns: { ...MEDIA_ITEM_COLUMNS, updateId: true },
		with: WITH_LOGGER,
		orderBy: MEDIA_ORDER
	});
	const overview: MediaItem[] = [];
	const byUpdate = new Map<string, MediaItem[]>();
	for (const r of rows) {
		const item = toMediaItem(r);
		if (!r.updateId) {
			overview.push(item);
			continue;
		}
		const list = byUpdate.get(r.updateId);
		if (list) list.push(item);
		else byUpdate.set(r.updateId, [item]);
	}
	return { overview, byUpdate };
}

export async function listIncidentMediaStatus(incidentId: string): Promise<MediaStatus[]> {
	return db
		.select({
			id: schema.media.id,
			status: schema.media.status,
			filename: schema.media.filename,
			posterKey: schema.media.posterKey
		})
		.from(schema.media)
		.where(eq(schema.media.healthEventId, incidentId))
		.orderBy(...MEDIA_ORDER);
}

export async function getIncidentMediaItem(
	incidentId: string,
	mediaId: string
): Promise<Media | undefined> {
	return db.query.media.findFirst({
		where: and(eq(schema.media.id, mediaId), eq(schema.media.healthEventId, incidentId))
	});
}

// One item as the UI sees it, scoped to the incident.
export async function getIncidentMediaView(
	incidentId: string,
	mediaId: string
): Promise<MediaItem | undefined> {
	const row = await db.query.media.findFirst({
		where: and(eq(schema.media.id, mediaId), eq(schema.media.healthEventId, incidentId)),
		columns: MEDIA_ITEM_COLUMNS,
		with: WITH_LOGGER
	});
	return row ? toMediaItem(row) : undefined;
}

// Count for one exact parent: the overview (updateId null) or one update.
export async function countIncidentMedia(
	incidentId: string,
	updateId: string | null
): Promise<number> {
	const [{ value }] = await db
		.select({ value: count() })
		.from(schema.media)
		.where(
			and(
				eq(schema.media.healthEventId, incidentId),
				updateId === null ? isNull(schema.media.updateId) : eq(schema.media.updateId, updateId)
			)
		);
	return value;
}

type IncidentMediaInsert = Omit<
	typeof schema.media.$inferInsert,
	'noteId' | 'entryId' | 'healthEventId' | 'updateId'
>;

// Check-and-insert under the write lock (see insertNoteMedia). Re-checks that
// the incident exists, that the update exists and belongs to the incident, and
// counts media for that exact parent.
function insertIncidentMedia(
	incidentId: string,
	updateId: string | null,
	row: IncidentMediaInsert,
	max: number
): IncidentMediaOutcome {
	return db.transaction(
		(tx): IncidentMediaOutcome => {
			const incident = tx
				.select({ id: schema.healthEvents.id })
				.from(schema.healthEvents)
				.where(eq(schema.healthEvents.id, incidentId))
				.get();
			if (!incident) return 'gone';
			if (updateId) {
				const update = tx
					.select({ id: schema.healthEventUpdates.id })
					.from(schema.healthEventUpdates)
					.where(
						and(
							eq(schema.healthEventUpdates.id, updateId),
							eq(schema.healthEventUpdates.healthEventId, incidentId)
						)
					)
					.get();
				if (!update) return 'gone';
			}
			const [{ value }] = tx
				.select({ value: count() })
				.from(schema.media)
				.where(
					and(
						eq(schema.media.healthEventId, incidentId),
						updateId === null ? isNull(schema.media.updateId) : eq(schema.media.updateId, updateId)
					)
				)
				.all();
			if (value >= max) return 'cap';
			tx.insert(schema.media)
				.values({ ...row, healthEventId: incidentId, updateId })
				.run();
			return 'ok';
		},
		{ behavior: 'immediate' }
	);
}

// Store the blob, then insert the row. Any path that ends without a row deletes
// the blob it just stored.
export async function saveIncidentMediaUpload(input: {
	companionId: string;
	incidentId: string;
	updateId: string | null;
	mediaId: string;
	prepared: PreparedMedia;
	originalName: string | null;
	loggedBy: string;
	max: number;
}): Promise<IncidentMediaOutcome | 'putFailed'> {
	const { companionId, incidentId, updateId, mediaId, prepared } = input;
	const key = incidentMediaKey(companionId, incidentId, prepared.filename);
	return storeThenInsert(key, prepared, 'incident-media', () =>
		insertIncidentMedia(
			incidentId,
			updateId,
			{
				id: mediaId,
				filename: prepared.filename,
				provider: STORAGE_BACKEND,
				storageKey: key,
				originalName: input.originalName,
				mediaType: prepared.mediaType,
				mimeType: prepared.contentType,
				sizeBytes: prepared.sizeBytes,
				status: prepared.willTranscode ? 'processing' : 'ready',
				loggedBy: input.loggedBy
			},
			input.max
		)
	);
}

export async function setIncidentMediaCaption(
	incidentId: string,
	mediaId: string,
	caption: string
): Promise<void> {
	await db
		.update(schema.media)
		.set({ caption: caption.trim() || null })
		.where(and(eq(schema.media.id, mediaId), eq(schema.media.healthEventId, incidentId)));
}

// Row first, then objects (as deleteNoteMediaItem).
export async function deleteIncidentMediaItem(item: Media): Promise<void> {
	if (!item.healthEventId) return;
	const deleted = await db
		.delete(schema.media)
		.where(and(eq(schema.media.id, item.id), eq(schema.media.healthEventId, item.healthEventId)))
		.returning({
			provider: schema.media.provider,
			storageKey: schema.media.storageKey,
			originalKey: schema.media.originalKey,
			posterKey: schema.media.posterKey
		});
	if (deleted.length > 0) await deleteMediaBlobs(deleted, 'incident-media');
}

type Viewer = { id: string; role: 'admin' | 'member' | 'caretaker' };

// Read rule for the status poll. Owners see any incident of the companion;
// caretakers need assignment (403), an active companion and an open incident
// (404). No shift, like asset URLs.
export async function checkIncidentMediaRead(
	user: Viewer | null,
	companionId: string,
	incidentId: string
): Promise<{ ok: true } | { ok: false; status: 401 | 403 | 404; key: MessageKey }> {
	if (!user) return { ok: false, status: 401, key: 'error.unauthorized' };
	const isCaretaker = user.role === 'caretaker';
	if (isCaretaker && !(await isAssigned(companionId, user.id))) {
		return { ok: false, status: 403, key: 'error.forbidden' };
	}
	const incident = await getIncident(companionId, incidentId);
	if (!incident || (isCaretaker && incident.resolvedAt)) {
		return { ok: false, status: 404, key: 'error.incidentNotFound' };
	}
	if (isCaretaker) {
		const companion = await db.query.companions.findFirst({
			where: eq(schema.companions.id, companionId),
			columns: { isActive: true }
		});
		if (!companion?.isActive) return { ok: false, status: 404, key: 'error.incidentNotFound' };
	}
	return { ok: true };
}

// Caretakers may only change or remove photos they uploaded themselves, on top
// of the incident write gate: an owner's photo stays put. Owners unrestricted.
export function canModifyIncidentMedia(user: Viewer, item: Pick<Media, 'loggedBy'>): boolean {
	return user.role !== 'caretaker' || item.loggedBy === user.id;
}
