import { db, schema } from '$lib/server/db';
import { and, asc, desc, eq, inArray, sql, type SQL } from 'drizzle-orm';
import { alias, union } from 'drizzle-orm/sqlite-core';
import { localDateISO } from '$lib/date';
import type { DayItem, DayItemDocument } from '$lib/dayItems';

export type { DayItem, DayItemDocument } from '$lib/dayItems';

// Server-local day keys. 'localtime' follows the process TZ, the same zone
// localDateISO uses, so these match the activities' bucketing in journal.ts.
const healthDay = sql<string>`date(${schema.healthEvents.occurredAt}, 'unixepoch', 'localtime')`;
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

const inRange = (day: SQL, range: { from: string; to: string }) =>
	sql`${day} between ${range.from} and ${range.to}`;

/** Health records for every day in [from, to] (inclusive, YYYY-MM-DD), keyed by day. */
export async function getDayItems(
	companionId: string,
	range: { from: string; to: string }
): Promise<Map<string, DayItem[]>> {
	const [events, weights, docs] = await Promise.all([
		db
			.select({
				id: schema.healthEvents.id,
				type: schema.healthEvents.type,
				title: schema.healthEvents.title,
				occurredAt: schema.healthEvents.occurredAt,
				day: healthDay
			})
			.from(schema.healthEvents)
			.where(and(eq(schema.healthEvents.companionId, companionId), inRange(healthDay, range)))
			.orderBy(asc(schema.healthEvents.occurredAt), asc(schema.healthEvents.id)),
		db
			.select({
				id: schema.weightEntries.id,
				weight: schema.weightEntries.weight,
				unit: schema.weightEntries.unit,
				recordedAt: schema.weightEntries.recordedAt,
				day: weightDay
			})
			.from(schema.weightEntries)
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

	const attached =
		events.length === 0
			? []
			: await db
					.select({ ...documentColumns, healthEventId: schema.documents.healthEventId })
					.from(schema.documents)
					.where(
						and(
							eq(schema.documents.companionId, companionId),
							inArray(
								schema.documents.healthEventId,
								events.map((e) => e.id)
							)
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
	// Push order is the within-day order: health, then weights, then documents.
	for (const e of events) {
		push(e.day, {
			kind: 'health',
			id: e.id,
			at: e.occurredAt.toISOString(),
			type: e.type,
			title: e.title,
			documents: docsByEvent.get(e.id) ?? []
		});
	}
	for (const w of weights) {
		push(w.day, {
			kind: 'weight',
			id: w.id,
			at: w.recordedAt.toISOString(),
			weight: w.weight,
			unit: w.unit
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
