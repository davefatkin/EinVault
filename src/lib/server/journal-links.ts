import { db, schema } from '#lib/server/db/index.js';
import type { Tx } from '#lib/server/db/tx.js';
import { and, asc, desc, eq, inArray, ne } from 'drizzle-orm';
import type { HealthEventType } from '#lib/health.js';
import { deleteMediaBlobs, type StoredMediaRef } from '#lib/server/storage/media-blobs.js';
import { ensureJournalEntry } from './journal';
import { healthDay } from './journal-day-items';

const links = schema.journalEntryHealthEvents;

/**
 * The journal days whose entries link each event, ascending. Only links whose
 * entry and event belong to `companionId` count.
 */
export async function getJournalDatesByEvent(
	companionId: string,
	eventIds: string[]
): Promise<Map<string, string[]>> {
	const byEvent = new Map<string, string[]>();
	if (eventIds.length === 0) return byEvent;
	const rows = await db
		.select({ healthEventId: links.healthEventId, date: schema.journalEntries.date })
		.from(links)
		.innerJoin(schema.journalEntries, eq(schema.journalEntries.id, links.entryId))
		.innerJoin(
			schema.healthEvents,
			and(
				eq(schema.healthEvents.id, links.healthEventId),
				eq(schema.healthEvents.companionId, schema.journalEntries.companionId)
			)
		)
		.where(
			and(
				eq(schema.journalEntries.companionId, companionId),
				inArray(links.healthEventId, eventIds)
			)
		)
		.orderBy(asc(schema.journalEntries.date));
	for (const r of rows) {
		const list = byEvent.get(r.healthEventId) ?? [];
		list.push(r.date);
		byEvent.set(r.healthEventId, list);
	}
	return byEvent;
}

/** Link a health event of this companion, on another day, to the day's entry. */
export async function linkHealthEvent(
	companionId: string,
	date: string,
	healthEventId: string,
	userId: string
): Promise<'linked' | 'notFound' | 'sameDay'> {
	const event = await db
		.select({ id: schema.healthEvents.id, day: healthDay })
		.from(schema.healthEvents)
		.where(
			and(
				eq(schema.healthEvents.id, healthEventId),
				eq(schema.healthEvents.companionId, companionId)
			)
		)
		.get();
	if (!event) return 'notFound';
	if (event.day === date) return 'sameDay';
	const entryId = await ensureJournalEntry(companionId, date, userId);
	await db.insert(links).values({ entryId, healthEventId }).onConflictDoNothing();
	return 'linked';
}

/** Delete the entry when nothing keeps it: empty body, no mood, no media, no links. */
function deleteEntryIfEmpty(tx: Tx, entryId: string): void {
	const entry = tx
		.select({ body: schema.journalEntries.body, mood: schema.journalEntries.mood })
		.from(schema.journalEntries)
		.where(eq(schema.journalEntries.id, entryId))
		.get();
	if (!entry || entry.body !== '' || entry.mood !== null) return;
	const hasMedia = tx
		.select({ id: schema.media.id })
		.from(schema.media)
		.where(eq(schema.media.entryId, entryId))
		.limit(1)
		.get();
	const hasLink = tx
		.select({ id: links.healthEventId })
		.from(links)
		.where(eq(links.entryId, entryId))
		.limit(1)
		.get();
	if (!hasMedia && !hasLink) {
		tx.delete(schema.journalEntries).where(eq(schema.journalEntries.id, entryId)).run();
	}
}

/**
 * Remove one link from the day's entry. The entry goes too when the link was
 * all that kept it: empty body, no mood, no media and no other links.
 */
export function unlinkHealthEvent(companionId: string, date: string, healthEventId: string): void {
	db.transaction((tx) => {
		const entry = tx
			.select({ id: schema.journalEntries.id })
			.from(schema.journalEntries)
			.where(
				and(
					eq(schema.journalEntries.companionId, companionId),
					eq(schema.journalEntries.date, date)
				)
			)
			.get();
		if (!entry) return;
		const { changes } = tx
			.delete(links)
			.where(and(eq(links.entryId, entry.id), eq(links.healthEventId, healthEventId)))
			.run();
		if (changes === 0) return;
		deleteEntryIfEmpty(tx, entry.id);
	});
}

/**
 * Delete a health event of this companion. Entries that existed only to link
 * it go with it. Returns whether the event was deleted.
 */
export async function deleteHealthEvent(
	companionId: string,
	healthEventId: string
): Promise<boolean> {
	// Media keys (the event's own plus its updates') are read in the same
	// immediate transaction as the delete, as deleteNote does; objects go after
	// commit.
	const { deleted, media } = db.transaction(
		(tx): { deleted: boolean; media: StoredMediaRef[] } => {
			const entryIds = tx
				.select({ id: links.entryId })
				.from(links)
				.innerJoin(schema.journalEntries, eq(schema.journalEntries.id, links.entryId))
				.where(
					and(
						eq(links.healthEventId, healthEventId),
						eq(schema.journalEntries.companionId, companionId)
					)
				)
				.all()
				.map((r) => r.id);
			const media = tx
				.select({
					provider: schema.media.provider,
					storageKey: schema.media.storageKey,
					originalKey: schema.media.originalKey,
					posterKey: schema.media.posterKey
				})
				.from(schema.media)
				.innerJoin(schema.healthEvents, eq(schema.healthEvents.id, schema.media.healthEventId))
				.where(
					and(
						eq(schema.media.healthEventId, healthEventId),
						eq(schema.healthEvents.companionId, companionId)
					)
				)
				.all();
			const { changes } = tx
				.delete(schema.healthEvents)
				.where(
					and(
						eq(schema.healthEvents.id, healthEventId),
						eq(schema.healthEvents.companionId, companionId)
					)
				)
				.run();
			for (const id of entryIds) deleteEntryIfEmpty(tx, id);
			return { deleted: changes > 0, media: changes > 0 ? media : [] };
		},
		{ behavior: 'immediate' }
	);
	if (media.length > 0) await deleteMediaBlobs(media, 'health-media');
	return deleted;
}

/** Events the day's entry can link: this companion's, not on this day, not linked yet. */
export async function listLinkableHealthEvents(
	companionId: string,
	date: string,
	entryId: string | null
): Promise<{ id: string; type: HealthEventType; title: string; day: string }[]> {
	const linked = entryId
		? new Set(
				(
					await db.select({ id: links.healthEventId }).from(links).where(eq(links.entryId, entryId))
				).map((l) => l.id)
			)
		: new Set<string>();
	const rows = await db
		.select({
			id: schema.healthEvents.id,
			type: schema.healthEvents.type,
			title: schema.healthEvents.title,
			day: healthDay
		})
		.from(schema.healthEvents)
		.where(and(eq(schema.healthEvents.companionId, companionId), ne(healthDay, date)))
		.orderBy(desc(schema.healthEvents.occurredAt), desc(schema.healthEvents.id));
	return rows.filter((r) => !linked.has(r.id));
}
