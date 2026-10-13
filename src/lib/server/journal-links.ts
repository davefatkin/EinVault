import { db, schema } from '$lib/server/db';
import { and, asc, eq, inArray } from 'drizzle-orm';

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
