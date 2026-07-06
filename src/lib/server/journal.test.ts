import { describe, it, expect, beforeAll } from 'vitest';
import { and, eq } from 'drizzle-orm';
import { db, schema } from '$lib/server/db';
import { upsertJournalEntry, getEnrichedJournalEntries } from './journal';

describe('journal', () => {
	beforeAll(async () => {
		await db.insert(schema.users).values({
			id: 'u-j',
			username: 'journal-user',
			displayName: 'J User',
			role: 'member'
		} as typeof schema.users.$inferInsert);
		await db.insert(schema.companions).values({
			id: 'c-j',
			name: 'Journie'
		} as typeof schema.companions.$inferInsert);
	});

	it('creates a new entry on first write for a date', async () => {
		await upsertJournalEntry('c-j', '2026-03-01', 'first body', 'good', 'u-j');
		const row = await db.query.journalEntries.findFirst({
			where: and(
				eq(schema.journalEntries.companionId, 'c-j'),
				eq(schema.journalEntries.date, '2026-03-01')
			)
		});
		expect(row).toMatchObject({ body: 'first body', mood: 'good', loggedBy: 'u-j' });
	});

	it('updates in place on second write for the same date (no duplicate row)', async () => {
		await upsertJournalEntry('c-j', '2026-03-01', 'second body', 'meh', 'u-j');
		const rows = await db.query.journalEntries.findMany({
			where: and(
				eq(schema.journalEntries.companionId, 'c-j'),
				eq(schema.journalEntries.date, '2026-03-01')
			)
		});
		expect(rows).toHaveLength(1);
		expect(rows[0]).toMatchObject({ body: 'second body', mood: 'meh' });
		expect(rows[0].updatedAt).not.toBeNull();
	});

	it('coerces null body to empty string', async () => {
		await upsertJournalEntry('c-j', '2026-03-02', null, null, 'u-j');
		const row = await db.query.journalEntries.findFirst({
			where: and(
				eq(schema.journalEntries.companionId, 'c-j'),
				eq(schema.journalEntries.date, '2026-03-02')
			)
		});
		expect(row!.body).toBe('');
		expect(row!.mood).toBeNull();
	});

	it('returns the entry id and preserves fields left undefined', async () => {
		const readBody = async (date: string) =>
			(await db.query.journalEntries.findFirst({
				where: and(
					eq(schema.journalEntries.companionId, 'c-j'),
					eq(schema.journalEntries.date, date)
				)
			}))!;

		const id1 = await upsertJournalEntry('c-j', '2026-05-01', 'the text', 'good', 'u-j');
		// Mood-only update (body undefined) must NOT wipe the text.
		const id2 = await upsertJournalEntry('c-j', '2026-05-01', undefined, 'meh', 'u-j');
		expect(id2).toBe(id1);
		let row = await readBody('2026-05-01');
		expect(row.body).toBe('the text');
		expect(row.mood).toBe('meh');

		// Body-only update (mood undefined) must NOT wipe the mood.
		await upsertJournalEntry('c-j', '2026-05-01', 'new text', undefined, 'u-j');
		row = await readBody('2026-05-01');
		expect(row.body).toBe('new text');
		expect(row.mood).toBe('meh');
	});

	it('paginates with hasMore and oldestDate', async () => {
		for (let d = 1; d <= 5; d++) {
			await upsertJournalEntry('c-j', `2026-04-0${d}`, `day ${d}`, null, 'u-j');
		}
		const page = await getEnrichedJournalEntries('c-j', { limit: 3 });
		expect(page.entries).toHaveLength(3);
		expect(page.hasMore).toBe(true);
		expect(page.entries[0].date > page.entries[2].date).toBe(true); // newest first
		expect(page.oldestDate).toBe(page.entries[2].date);

		const rest = await getEnrichedJournalEntries('c-j', { limit: 50, before: page.oldestDate! });
		expect(rest.entries.every((e) => e.date < page.oldestDate!)).toBe(true);
		expect(rest.hasMore).toBe(false);
	});

	it('update sets updatedBy; create leaves it null', async () => {
		await db.insert(schema.users).values({
			id: 'u-j2',
			username: 'journal-editor',
			displayName: 'J Editor',
			role: 'admin'
		} as typeof schema.users.$inferInsert);

		await upsertJournalEntry('c-j', '2026-03-10', 'original', null, 'u-j');
		let row = await db.query.journalEntries.findFirst({
			where: and(
				eq(schema.journalEntries.companionId, 'c-j'),
				eq(schema.journalEntries.date, '2026-03-10')
			)
		});
		expect(row!.updatedBy).toBeNull();

		await upsertJournalEntry('c-j', '2026-03-10', 'edited', null, 'u-j2');
		row = await db.query.journalEntries.findFirst({
			where: and(
				eq(schema.journalEntries.companionId, 'c-j'),
				eq(schema.journalEntries.date, '2026-03-10')
			)
		});
		expect(row!.updatedBy).toBe('u-j2');
		expect(row!.loggedBy).toBe('u-j'); // original author preserved
	});

	it('enriched entries expose the updater displayName', async () => {
		const page = await getEnrichedJournalEntries('c-j', { limit: 50 });
		const entry = page.entries.find((e) => e.date === '2026-03-10');
		expect(entry?.updater?.displayName).toBe('J Editor');
		expect(entry?.logger?.displayName).toBe('J User');
	});

	// Local noon avoids UTC-midnight boundary flakes regardless of test TZ.
	const localNoon = (date: string) => {
		const [y, m, d] = date.split('-').map(Number);
		return new Date(y, m - 1, d, 12, 0, 0);
	};

	const insertEvent = (companionId: string, date: string) =>
		db.insert(schema.dailyEvents).values({
			id: `ev-${companionId}-${date}`,
			companionId,
			type: 'walk',
			notes: null,
			durationMinutes: null,
			loggedAt: localNoon(date),
			loggedBy: 'u-j'
		} as typeof schema.dailyEvents.$inferInsert);

	it('shows an activity-only day newer than the newest journal entry (#181)', async () => {
		// Newest journal entry for c-j is 2026-05-01; log activity on a later day
		// with no journal entry.
		await insertEvent('c-j', '2026-06-15');
		const page = await getEnrichedJournalEntries('c-j', { limit: 50 });
		const day = page.entries.find((e) => e.date === '2026-06-15');
		expect(day).toBeDefined();
		expect(day!.id).toBeNull();
		expect(day!.events).toHaveLength(1);
		expect(page.entries[0].date).toBe('2026-06-15'); // newest first
	});

	it('shows activity-only days when the companion has no journal entries at all', async () => {
		await db.insert(schema.companions).values({
			id: 'c-j2',
			name: 'Eventful'
		} as typeof schema.companions.$inferInsert);
		await insertEvent('c-j2', '2026-06-10');
		await insertEvent('c-j2', '2026-06-12');

		const page = await getEnrichedJournalEntries('c-j2');
		expect(page.entries.map((e) => e.date)).toEqual(['2026-06-12', '2026-06-10']);
		expect(page.entries.every((e) => e.id === null && e.events.length === 1)).toBe(true);
	});

	it('paginates over days including activity-only days', async () => {
		await db.insert(schema.companions).values({
			id: 'c-j3',
			name: 'Pager'
		} as typeof schema.companions.$inferInsert);
		// Interleaved: journal entries on 01/03, activity-only days on 02/04.
		await upsertJournalEntry('c-j3', '2026-06-01', 'entry 1', null, 'u-j');
		await insertEvent('c-j3', '2026-06-02');
		await upsertJournalEntry('c-j3', '2026-06-03', 'entry 3', null, 'u-j');
		await insertEvent('c-j3', '2026-06-04');

		const page1 = await getEnrichedJournalEntries('c-j3', { limit: 2 });
		expect(page1.entries.map((e) => e.date)).toEqual(['2026-06-04', '2026-06-03']);
		expect(page1.hasMore).toBe(true);
		expect(page1.oldestDate).toBe('2026-06-03');

		const page2 = await getEnrichedJournalEntries('c-j3', {
			limit: 2,
			before: page1.oldestDate!
		});
		expect(page2.entries.map((e) => e.date)).toEqual(['2026-06-02', '2026-06-01']);
		expect(page2.hasMore).toBe(false);
	});
});
