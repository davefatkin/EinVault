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
});
