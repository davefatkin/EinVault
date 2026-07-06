import { db, schema } from '$lib/server/db';
import { eq, lt, gte, and, inArray, sql, desc } from 'drizzle-orm';
import { localDateISO } from '$lib/date';
import { generateId } from '$lib/server/utils';
import type { Mood } from '$lib/server/validation';
import type { UserRef } from '$lib/types';

const PAGE_SIZE = 20;

export async function getEnrichedJournalEntries(
	companionId: string,
	opts?: { limit?: number; before?: string }
) {
	const pageSize = opts?.limit ?? PAGE_SIZE;
	const before = opts?.before;

	// The timeline paginates over DAYS: a day is shown when it has a journal
	// entry, a daily event, or both. Fetch pageSize+1 candidate days from each
	// source; the k newest days of the union are then guaranteed complete
	// (adding dates from the other source only pushes a source's own dates down
	// the order, never past its fetch horizon).
	// loggedAt is stored as unixepoch seconds; 'localtime' matches the process
	// TZ that localDateISO uses, so both sides bucket days identically.
	const eventDay = sql<string>`date(${schema.dailyEvents.loggedAt}, 'unixepoch', 'localtime')`;
	const [entries, eventDayRows] = await Promise.all([
		db.query.journalEntries.findMany({
			where: and(
				eq(schema.journalEntries.companionId, companionId),
				before ? lt(schema.journalEntries.date, before) : undefined
			),
			orderBy: (j, { desc }) => [desc(j.date)],
			limit: pageSize + 1,
			with: {
				logger: { columns: { displayName: true } },
				updater: { columns: { displayName: true } }
			}
		}),
		db
			.select({ date: eventDay })
			.from(schema.dailyEvents)
			.where(
				and(
					eq(schema.dailyEvents.companionId, companionId),
					before ? sql`${eventDay} < ${before}` : undefined
				)
			)
			.groupBy(eventDay)
			.orderBy(desc(eventDay))
			.limit(pageSize + 1)
	]);

	const dateSet = new Set([...entries.map((e) => e.date), ...eventDayRows.map((r) => r.date)]);
	// Sort descending (ISO strings sort lexicographically)
	const sortedDates = [...dateSet].sort((a, b) => (a < b ? 1 : -1));
	const hasMore = sortedDates.length > pageSize;
	const allDates = sortedDates.slice(0, pageSize);
	const shownDates = new Set(allDates);
	const pageEntries = entries.filter((e) => shownDates.has(e.date));

	type EventWithUserRef = typeof schema.dailyEvents.$inferSelect & {
		logger: UserRef;
	};
	type MediaWithUserRef = typeof schema.journalPhotos.$inferSelect & {
		logger: UserRef;
	};
	let mediaByEntry = new Map<string, MediaWithUserRef[]>();
	let eventsByDate = new Map<string, EventWithUserRef[]>();

	if (allDates.length > 0) {
		const entryIds = pageEntries.map((e) => e.id);
		const oldest = allDates[allDates.length - 1];
		const newest = allDates[0];
		const [oy, om, od] = oldest.split('-').map(Number);
		const [ny, nm, nd] = newest.split('-').map(Number);
		const rangeStart = new Date(oy, om - 1, od); // local midnight (respects TZ)
		const rangeEnd = new Date(ny, nm - 1, nd + 1); // next local midnight after newest

		const [allMedia, allEvents] = await Promise.all([
			db.query.journalPhotos.findMany({
				where: inArray(schema.journalPhotos.entryId, entryIds),
				orderBy: (p, { asc }) => [asc(p.createdAt)],
				with: { logger: { columns: { displayName: true } } }
			}),
			db.query.dailyEvents.findMany({
				where: and(
					eq(schema.dailyEvents.companionId, companionId),
					gte(schema.dailyEvents.loggedAt, rangeStart),
					lt(schema.dailyEvents.loggedAt, rangeEnd)
				),
				orderBy: (d, { asc }) => [asc(d.loggedAt)],
				with: { logger: { columns: { displayName: true } } }
			})
		]);

		for (const item of allMedia) {
			if (!mediaByEntry.has(item.entryId)) mediaByEntry.set(item.entryId, []);
			mediaByEntry.get(item.entryId)!.push(item);
		}
		for (const event of allEvents) {
			const date = localDateISO(new Date(event.loggedAt));
			// A day inside the range but past a source's fetch horizon can't
			// exist (see pagination note above), but guard anyway.
			if (!shownDates.has(date)) continue;
			if (!eventsByDate.has(date)) eventsByDate.set(date, []);
			eventsByDate.get(date)!.push(event);
		}
	}

	const entryByDate = new Map(pageEntries.map((e) => [e.date, e]));
	const enrichedEntries = allDates.map((date) => {
		const entry = entryByDate.get(date);
		return {
			date,
			id: entry?.id ?? null,
			body: entry?.body ?? '',
			mood: entry?.mood ?? null,
			loggedBy: entry?.loggedBy ?? null,
			updatedBy: entry?.updatedBy ?? null,
			companionId: entry?.companionId ?? companionId,
			createdAt: entry?.createdAt ?? null,
			updatedAt: entry?.updatedAt ?? null,
			logger: entry?.logger ?? null,
			updater: entry?.updater ?? null,
			photos: entry ? (mediaByEntry.get(entry.id) ?? []) : [],
			events: eventsByDate.get(date) ?? []
		};
	});

	return {
		entries: enrichedEntries,
		hasMore,
		oldestDate: allDates.length > 0 ? allDates[allDates.length - 1] : null
	};
}

// Upsert the (companion, date) journal entry and return its id. Passing
// `undefined` for body or mood PRESERVES the stored value (partial update);
// pass `null`/`''` to explicitly clear. The web form always sends both fields
// (full replace); the API uses undefined so a mood-only POST can't wipe the
// day's text and vice versa.
export async function upsertJournalEntry(
	companionId: string,
	date: string,
	body: string | null | undefined,
	mood: Mood | null | undefined,
	userId: string
): Promise<string> {
	const existing = await db.query.journalEntries.findFirst({
		where: and(
			eq(schema.journalEntries.companionId, companionId),
			eq(schema.journalEntries.date, date)
		)
	});

	if (existing) {
		const patch: {
			mood?: Mood | null;
			body?: string;
			updatedAt: Date;
			updatedBy: string;
		} = { updatedAt: new Date(), updatedBy: userId };
		if (body !== undefined) patch.body = body ?? '';
		if (mood !== undefined) patch.mood = mood;
		await db
			.update(schema.journalEntries)
			.set(patch)
			.where(eq(schema.journalEntries.id, existing.id));
		return existing.id;
	}

	const id = generateId(15);
	await db.insert(schema.journalEntries).values({
		id,
		companionId,
		date,
		body: body ?? '',
		mood: mood ?? null,
		loggedBy: userId
	});
	return id;
}
