import { and, asc, eq, inArray } from 'drizzle-orm';
import { db, schema } from '#lib/server/db/index.js';
import { listLinkedEvents } from '#lib/server/incident-links.js';
import { listIncidentMedia } from '#lib/server/incident-media.js';
import { getJournalDatesByEvent } from '#lib/server/journal-links.js';
import { currentSeverity } from '#lib/incidents.js';
import type {
	DocRef,
	IncidentDetailData,
	IncidentView,
	Severity,
	TimelineItem,
	UpdateView
} from '#lib/incidents.js';

const WITH_LOGGER = { logger: { columns: { displayName: true } } } as const;

// Everything the incident page shows, for an owner or a caretaker. The
// caretaker view follows the spec's read rule: open incidents only, no
// documents and no journal links (the shared component treats them as absent).
export async function loadIncidentDetail(
	companionId: string,
	id: string,
	viewer: 'owner' | 'caretaker'
): Promise<IncidentDetailData | null> {
	const row = await db.query.healthEvents.findFirst({
		where: and(
			eq(schema.healthEvents.id, id),
			eq(schema.healthEvents.companionId, companionId),
			eq(schema.healthEvents.type, 'incident')
		),
		with: WITH_LOGGER
	});
	if (!row) return null;
	if (viewer === 'caretaker' && row.resolvedAt) return null;
	const isOwner = viewer === 'owner';

	const [updateRows, linked, media] = await Promise.all([
		db.query.healthEventUpdates.findMany({
			where: eq(schema.healthEventUpdates.healthEventId, row.id),
			// Ties on occurredAt resolve by creation order (see listOpenIncidents).
			orderBy: [
				asc(schema.healthEventUpdates.occurredAt),
				asc(schema.healthEventUpdates.createdAt)
			],
			with: WITH_LOGGER
		}),
		listLinkedEvents(companionId, row.id),
		listIncidentMedia(row.id)
	]);

	const docsByEvent = new Map<string, DocRef[]>();
	let journalDates: string[] = [];
	if (isOwner) {
		const docs = await db.query.documents.findMany({
			where: and(
				eq(schema.documents.companionId, companionId),
				inArray(schema.documents.healthEventId, [row.id, ...linked.map((e) => e.id)])
			),
			columns: { id: true, title: true, filename: true, mimeType: true, healthEventId: true },
			orderBy: [asc(schema.documents.createdAt), asc(schema.documents.id)]
		});
		for (const { healthEventId, ...ref } of docs) {
			if (!healthEventId) continue;
			const list = docsByEvent.get(healthEventId) ?? [];
			list.push(ref);
			docsByEvent.set(healthEventId, list);
		}
		journalDates = (await getJournalDatesByEvent(companionId, [row.id])).get(row.id) ?? [];
	}

	const updates: UpdateView[] = updateRows.map((u) => ({
		id: u.id,
		body: u.body,
		severity: u.severity as Severity | null,
		occurredAt: u.occurredAt,
		createdAt: u.createdAt,
		loggedBy: u.loggedBy,
		logger: u.logger ?? null,
		media: media.byUpdate.get(u.id) ?? []
	}));

	// Stable merge by occurredAt: on a tie the update comes first, since it was
	// written about the incident itself.
	const dated: { at: number; rank: number; item: TimelineItem }[] = [
		...updates.map((update) => ({
			at: update.occurredAt.getTime(),
			rank: 0,
			item: { kind: 'update', update } as const
		})),
		...linked.map((event) => ({
			at: event.occurredAt.getTime(),
			rank: 1,
			item: { kind: 'event', event, documents: docsByEvent.get(event.id) ?? [] } as const
		}))
	];
	dated.sort((a, b) => a.at - b.at || a.rank - b.rank);
	const timeline: TimelineItem[] = dated.map((x) => x.item);
	if (row.resolvedAt) timeline.push({ kind: 'resolved', at: row.resolvedAt });

	const incident: IncidentView = {
		id: row.id,
		companionId: row.companionId,
		title: row.title,
		notes: row.notes,
		occurredAt: row.occurredAt,
		severity: row.severity as Severity | null,
		resolvedAt: row.resolvedAt,
		loggedBy: row.loggedBy,
		logger: row.logger ?? null
	};

	return {
		incident,
		currentSeverity: currentSeverity(incident, updates),
		overviewMedia: media.overview,
		timeline,
		documents: docsByEvent.get(row.id) ?? [],
		journalDates
	};
}
