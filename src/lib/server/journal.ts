import { db, schema } from '$lib/server/db';
import { eq, lt, gte, and, inArray } from 'drizzle-orm';
import { localDateISO } from '$lib/date';
import { generateId } from '$lib/server/utils';
import type { Mood } from '$lib/server/validation';

const PAGE_SIZE = 20;

export async function getEnrichedJournalEntries(
	companionId: string,
	opts?: { limit?: number; before?: string }
) {
	const pageSize = opts?.limit ?? PAGE_SIZE;
	const before = opts?.before;

	const entries = await db.query.journalEntries.findMany({
		where: and(
			eq(schema.journalEntries.companionId, companionId),
			before ? lt(schema.journalEntries.date, before) : undefined
		),
		orderBy: (j, { desc }) => [desc(j.date)],
		limit: pageSize + 1,
		with: { logger: { columns: { displayName: true } } }
	});

	const hasMore = entries.length > pageSize;
	const pageEntries = entries.slice(0, pageSize);

	type EventWithLogger = typeof schema.dailyEvents.$inferSelect & {
		logger: { displayName: string } | null;
	};
	let photosByEntry = new Map<string, (typeof schema.journalPhotos.$inferSelect)[]>();
	let eventsByDate = new Map<string, EventWithLogger[]>();

	if (pageEntries.length > 0) {
		const entryIds = pageEntries.map((e) => e.id);
		const oldest = pageEntries[pageEntries.length - 1].date;
		const newest = pageEntries[0].date;
		const [oy, om, od] = oldest.split('-').map(Number);
		const [ny, nm, nd] = newest.split('-').map(Number);
		const rangeStart = new Date(oy, om - 1, od); // local midnight (respects TZ)
		const rangeEnd = new Date(ny, nm - 1, nd + 1); // next local midnight after newest

		const [allPhotos, allEvents] = await Promise.all([
			db.query.journalPhotos.findMany({
				where: inArray(schema.journalPhotos.entryId, entryIds),
				orderBy: (p, { asc }) => [asc(p.createdAt)]
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

		for (const photo of allPhotos) {
			if (!photosByEntry.has(photo.entryId)) photosByEntry.set(photo.entryId, []);
			photosByEntry.get(photo.entryId)!.push(photo);
		}
		for (const event of allEvents) {
			const date = localDateISO(new Date(event.loggedAt));
			if (!eventsByDate.has(date)) eventsByDate.set(date, []);
			eventsByDate.get(date)!.push(event);
		}
	}

	const enrichedEntries = pageEntries.map((entry) => ({
		...entry,
		photos: photosByEntry.get(entry.id) ?? [],
		events: eventsByDate.get(entry.date) ?? []
	}));

	return {
		entries: enrichedEntries,
		hasMore,
		oldestDate: pageEntries.length > 0 ? pageEntries[pageEntries.length - 1].date : null
	};
}

export async function upsertJournalEntry(
	companionId: string,
	date: string,
	body: string | null,
	mood: Mood | null,
	userId: string
) {
	const existing = await db.query.journalEntries.findFirst({
		where: and(
			eq(schema.journalEntries.companionId, companionId),
			eq(schema.journalEntries.date, date)
		)
	});

	if (existing) {
		await db
			.update(schema.journalEntries)
			.set({ body: body ?? '', mood, updatedAt: new Date() })
			.where(eq(schema.journalEntries.id, existing.id));
	} else {
		await db.insert(schema.journalEntries).values({
			id: generateId(15),
			companionId,
			date,
			body: body ?? '',
			mood,
			loggedBy: userId
		});
	}
}
