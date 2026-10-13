import { db, schema } from '$lib/server/db';
import { and, asc, desc, eq, inArray, ne } from 'drizzle-orm';
import type { HealthEventType } from '$lib/health';
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

/**
 * Remove one link from the day's entry. The entry goes too when the link was
 * all that kept it: empty body, no mood, no media and no other links.
 */
export function unlinkHealthEvent(companionId: string, date: string, healthEventId: string): void {
	db.transaction((tx) => {
		const entry = tx
			.select({
				id: schema.journalEntries.id,
				body: schema.journalEntries.body,
				mood: schema.journalEntries.mood
			})
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
		if (entry.body !== '' || entry.mood !== null) return;
		const hasMedia = tx
			.select({ id: schema.media.id })
			.from(schema.media)
			.where(eq(schema.media.entryId, entry.id))
			.limit(1)
			.get();
		const hasLink = tx
			.select({ id: links.healthEventId })
			.from(links)
			.where(eq(links.entryId, entry.id))
			.limit(1)
			.get();
		if (!hasMedia && !hasLink) {
			tx.delete(schema.journalEntries).where(eq(schema.journalEntries.id, entry.id)).run();
		}
	});
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
