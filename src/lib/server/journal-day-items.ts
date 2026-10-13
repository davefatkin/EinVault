import { db, schema } from '$lib/server/db';
import { and, asc, desc, eq, inArray, sql, type SQL } from 'drizzle-orm';
import { alias, union } from 'drizzle-orm/sqlite-core';
import { localDateISO } from '$lib/date';
import { getJournalDatesByEvent } from './journal-links';
import type { DayItem, DayItemDocument } from '$lib/dayItems';

export type { DayItem, DayItemDocument } from '$lib/dayItems';

// Server-local day keys. 'localtime' follows the process TZ, the same zone
// localDateISO uses, so these match the activities' bucketing in journal.ts.
export const healthDay = sql<string>`date(${schema.healthEvents.occurredAt}, 'unixepoch', 'localtime')`;
const weightDay = sql<string>`date(${schema.weightEntries.recordedAt}, 'unixepoch', 'localtime')`;
const documentDay = sql<string>`coalesce(${schema.documents.documentDate}, date(${schema.documents.createdAt}, 'unixepoch', 'localtime'))`;

// The event a document is attached to, only when it belongs to the same
// companion. The FK can't enforce that, so a cross-companion link reads as
// unattached.
const owningEvent = alias(schema.healthEvents, 'owning_event');
const owningEventJoin = and(
	eq(owningEvent.id, schema.documents.healthEventId),
	eq(owningEvent.companionId, schema.documents.companionId)
);

// An attached document is listed under its event. It also gets a day of its
// own only when its documentDate falls on a different day than the event.
const hasOwnDay = sql`(${owningEvent.id} is null or (${schema.documents.documentDate} is not null and ${schema.documents.documentDate} <> date(${owningEvent.occurredAt}, 'unixepoch', 'localtime')))`;

const documentColumns = {
	id: schema.documents.id,
	date: documentDay,
	title: schema.documents.title,
	category: schema.documents.category,
	mimeType: schema.documents.mimeType,
	filename: schema.documents.filename
};

const toDocument = (d: DayItemDocument): DayItemDocument => ({
	id: d.id,
	date: d.date,
	title: d.title,
	category: d.category,
	mimeType: d.mimeType,
	filename: d.filename
});

const healthColumns = {
	id: schema.healthEvents.id,
	type: schema.healthEvents.type,
	title: schema.healthEvents.title,
	occurredAt: schema.healthEvents.occurredAt,
	vetName: schema.healthEvents.vetName,
	vetClinic: schema.healthEvents.vetClinic,
	notes: schema.healthEvents.notes,
	loggerName: schema.users.displayName,
	day: healthDay
};

const selectHealthEvents = (where: SQL | undefined) =>
	db
		.select(healthColumns)
		.from(schema.healthEvents)
		.leftJoin(schema.users, eq(schema.users.id, schema.healthEvents.loggedBy))
		.where(where)
		.orderBy(asc(schema.healthEvents.occurredAt), asc(schema.healthEvents.id));

const inRange = (day: SQL, range: { from: string; to: string }) =>
	sql`${day} between ${range.from} and ${range.to}`;

/** Health records for every day in [from, to] (inclusive, YYYY-MM-DD), keyed by day. */
export async function getDayItems(
	companionId: string,
	range: { from: string; to: string }
): Promise<Map<string, DayItem[]>> {
	const [events, linkRows, weights, docs] = await Promise.all([
		selectHealthEvents(
			and(eq(schema.healthEvents.companionId, companionId), inRange(healthDay, range))
		),
		db
			.select({
				date: schema.journalEntries.date,
				healthEventId: schema.journalEntryHealthEvents.healthEventId
			})
			.from(schema.journalEntryHealthEvents)
			.innerJoin(
				schema.journalEntries,
				eq(schema.journalEntries.id, schema.journalEntryHealthEvents.entryId)
			)
			.where(
				and(
					eq(schema.journalEntries.companionId, companionId),
					sql`${schema.journalEntries.date} between ${range.from} and ${range.to}`
				)
			),
		db
			.select({
				id: schema.weightEntries.id,
				weight: schema.weightEntries.weight,
				unit: schema.weightEntries.unit,
				recordedAt: schema.weightEntries.recordedAt,
				notes: schema.weightEntries.notes,
				loggerName: schema.users.displayName,
				day: weightDay
			})
			.from(schema.weightEntries)
			.leftJoin(schema.users, eq(schema.users.id, schema.weightEntries.loggedBy))
			.where(and(eq(schema.weightEntries.companionId, companionId), inRange(weightDay, range)))
			.orderBy(asc(schema.weightEntries.recordedAt), asc(schema.weightEntries.id)),
		db
			.select({ ...documentColumns, eventTitle: owningEvent.title })
			.from(schema.documents)
			.leftJoin(owningEvent, owningEventJoin)
			.where(
				and(eq(schema.documents.companionId, companionId), hasOwnDay, inRange(documentDay, range))
			)
			.orderBy(asc(schema.documents.createdAt), asc(schema.documents.id))
	]);

	// Linked events from other days, same companion only (drops cross-companion rows).
	const ownIds = new Set(events.map((e) => e.id));
	const linkedIds = [...new Set(linkRows.map((l) => l.healthEventId))].filter(
		(id) => !ownIds.has(id)
	);
	const linkedEvents =
		linkedIds.length === 0
			? []
			: await selectHealthEvents(
					and(
						eq(schema.healthEvents.companionId, companionId),
						inArray(schema.healthEvents.id, linkedIds)
					)
				);
	const eventById = new Map([...events, ...linkedEvents].map((e) => [e.id, e]));
	const linkedPairs = new Set(linkRows.map((l) => `${l.date}:${l.healthEventId}`));

	const attached =
		eventById.size === 0
			? []
			: await db
					.select({ ...documentColumns, healthEventId: schema.documents.healthEventId })
					.from(schema.documents)
					.where(
						and(
							eq(schema.documents.companionId, companionId),
							inArray(schema.documents.healthEventId, [...eventById.keys()])
						)
					)
					.orderBy(asc(schema.documents.createdAt), asc(schema.documents.id));

	const docsByEvent = new Map<string, DayItemDocument[]>();
	for (const d of attached) {
		if (!d.healthEventId) continue; // inArray guarantees it; narrows the type
		const list = docsByEvent.get(d.healthEventId) ?? [];
		list.push(toDocument(d));
		docsByEvent.set(d.healthEventId, list);
	}

	const byDay = new Map<string, DayItem[]>();
	const push = (day: string, item: DayItem) => {
		const list = byDay.get(day) ?? [];
		list.push(item);
		byDay.set(day, list);
	};
	const journalDates = await getJournalDatesByEvent(companionId, [...eventById.keys()]);
	const toHealthItem = (e: (typeof events)[number], day: string, fromLink: boolean): DayItem => ({
		kind: 'health',
		id: e.id,
		at: e.occurredAt.toISOString(),
		type: e.type,
		title: e.title,
		vetName: e.vetName,
		vetClinic: e.vetClinic,
		notes: e.notes,
		logger: e.loggerName ? { displayName: e.loggerName } : null,
		linkedHere: linkedPairs.has(`${day}:${e.id}`),
		fromLink,
		journalDates: journalDates.get(e.id) ?? [],
		documents: docsByEvent.get(e.id) ?? []
	});
	// Push order is the within-day order: own-day health, linked health from
	// other days, then weights, then documents.
	for (const e of events) push(e.day, toHealthItem(e, e.day, false));
	const linkedFromElsewhere = linkRows
		.map((l) => ({ date: l.date, event: eventById.get(l.healthEventId) }))
		.filter(
			(l): l is { date: string; event: (typeof events)[number] } =>
				!!l.event && l.event.day !== l.date
		)
		.sort(
			(a, b) =>
				a.event.occurredAt.getTime() - b.event.occurredAt.getTime() ||
				a.event.id.localeCompare(b.event.id)
		);
	for (const l of linkedFromElsewhere) push(l.date, toHealthItem(l.event, l.date, true));
	for (const w of weights) {
		push(w.day, {
			kind: 'weight',
			id: w.id,
			at: w.recordedAt.toISOString(),
			weight: w.weight,
			unit: w.unit,
			notes: w.notes,
			logger: w.loggerName ? { displayName: w.loggerName } : null
		});
	}
	for (const d of docs) {
		push(d.date, { kind: 'document', eventTitle: d.eventTitle ?? null, ...toDocument(d) });
	}
	return byDay;
}

/** Newest distinct days (up to today) that have at least one health record. */
export async function listDayItemDates(
	companionId: string,
	opts: { before?: string; limit: number }
): Promise<string[]> {
	const today = localDateISO();
	const window = (day: SQL) =>
		and(sql`${day} <= ${today}`, opts.before ? sql`${day} < ${opts.before}` : undefined);

	const rows = await union(
		db
			.select({ day: healthDay.as('day') })
			.from(schema.healthEvents)
			.where(and(eq(schema.healthEvents.companionId, companionId), window(healthDay))),
		db
			.select({ day: weightDay.as('day') })
			.from(schema.weightEntries)
			.where(and(eq(schema.weightEntries.companionId, companionId), window(weightDay))),
		db
			.select({ day: documentDay.as('day') })
			.from(schema.documents)
			.leftJoin(owningEvent, owningEventJoin)
			.where(and(eq(schema.documents.companionId, companionId), hasOwnDay, window(documentDay)))
	)
		.orderBy(desc(sql`day`))
		.limit(opts.limit);

	return rows.map((r) => r.day);
}
