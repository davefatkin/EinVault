import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { and, eq } from 'drizzle-orm';
import { db, schema } from '$lib/server/db';
import { upsertJournalEntry } from './journal';
import { linkHealthEvent, unlinkHealthEvent, listLinkableHealthEvents } from './journal-links';

const ORIGINAL_TZ = process.env.TZ;
beforeAll(() => {
	process.env.TZ = 'America/New_York';
});
afterAll(() => {
	if (ORIGINAL_TZ === undefined) delete process.env.TZ;
	else process.env.TZ = ORIGINAL_TZ;
});

const C = 'c-jlk';
const OTHER = 'c-jlk-other';
const entryOn = (date: string) =>
	db.query.journalEntries.findFirst({
		where: and(eq(schema.journalEntries.companionId, C), eq(schema.journalEntries.date, date))
	});
const linkCount = () =>
	db
		.select()
		.from(schema.journalEntryHealthEvents)
		.then((r) => r.length);

describe('journal links', () => {
	beforeAll(async () => {
		await db.insert(schema.users).values([
			{ id: 'u-jlk', username: 'u-jlk', displayName: 'U', role: 'member' },
			{ id: 'u-jlk2', username: 'u-jlk2', displayName: 'U2', role: 'member' }
		] as (typeof schema.users.$inferInsert)[]);
		await db.insert(schema.companions).values([
			{ id: C, name: 'Linker' },
			{ id: OTHER, name: 'Other' }
		] as (typeof schema.companions.$inferInsert)[]);
		await db.insert(schema.healthEvents).values([
			{
				id: 'ev-old',
				companionId: C,
				type: 'vet_visit',
				title: 'Old visit',
				occurredAt: new Date(2026, 4, 1, 12)
			},
			{
				id: 'ev-late',
				companionId: C,
				type: 'vet_visit',
				title: 'Late night',
				occurredAt: new Date(2026, 4, 10, 23, 30)
			},
			{
				id: 'ev-foreign',
				companionId: OTHER,
				type: 'vet_visit',
				title: 'Theirs',
				occurredAt: new Date(2026, 4, 2, 12)
			}
		]);
	});

	it('links on an existing entry without touching its text, mood or updatedBy', async () => {
		await upsertJournalEntry(C, '2026-05-20', 'notes', 'meh', 'u-jlk');
		const before = await entryOn('2026-05-20');
		expect(await linkHealthEvent(C, '2026-05-20', 'ev-old', 'u-jlk2')).toBe('linked');
		expect(await entryOn('2026-05-20')).toEqual(before);
	});

	it('is idempotent', async () => {
		const n = await linkCount();
		expect(await linkHealthEvent(C, '2026-05-20', 'ev-old', 'u-jlk')).toBe('linked');
		expect(await linkCount()).toBe(n);
	});

	it('creates the entry when the day has none', async () => {
		expect(await linkHealthEvent(C, '2026-05-21', 'ev-old', 'u-jlk')).toBe('linked');
		expect(await entryOn('2026-05-21')).toMatchObject({ body: '', mood: null });
	});

	it("rejects another companion's event and a same-day event, writing nothing", async () => {
		const n = await linkCount();
		expect(await linkHealthEvent(C, '2026-05-22', 'ev-foreign', 'u-jlk')).toBe('notFound');
		// 23:30 local on May 10 is May 11 in UTC; the server-local day is the 10th.
		expect(await linkHealthEvent(C, '2026-05-10', 'ev-late', 'u-jlk')).toBe('sameDay');
		expect(await linkCount()).toBe(n);
		expect(await entryOn('2026-05-22')).toBeUndefined();
	});

	it('unlink removes only that pair and keeps an entry with text', async () => {
		await linkHealthEvent(C, '2026-05-20', 'ev-late', 'u-jlk');
		unlinkHealthEvent(C, '2026-05-20', 'ev-old');
		const entry = await entryOn('2026-05-20');
		const rest = await db
			.select()
			.from(schema.journalEntryHealthEvents)
			.where(eq(schema.journalEntryHealthEvents.entryId, entry!.id));
		expect(rest.map((r) => r.healthEventId)).toEqual(['ev-late']);
	});

	it('unlink deletes an entry left empty, and is a no-op for a missing pair', async () => {
		unlinkHealthEvent(C, '2026-05-21', 'ev-foreign'); // no such pair
		expect(await entryOn('2026-05-21')).toBeDefined();
		unlinkHealthEvent(C, '2026-05-21', 'ev-old');
		expect(await entryOn('2026-05-21')).toBeUndefined();
	});

	it('unlink keeps an empty-text entry that has a mood, media or another link', async () => {
		await upsertJournalEntry(C, '2026-05-23', '', 'good', 'u-jlk');
		await linkHealthEvent(C, '2026-05-23', 'ev-old', 'u-jlk');
		unlinkHealthEvent(C, '2026-05-23', 'ev-old');
		expect(await entryOn('2026-05-23')).toBeDefined();

		await linkHealthEvent(C, '2026-05-24', 'ev-old', 'u-jlk');
		const e24 = await entryOn('2026-05-24');
		await db.insert(schema.media).values({
			id: 'm-jlk',
			entryId: e24!.id,
			filename: 'm.jpg',
			provider: 'local',
			storageKey: 'journal/x/m.jpg',
			mimeType: 'image/jpeg',
			sizeBytes: 1
		} as typeof schema.media.$inferInsert);
		unlinkHealthEvent(C, '2026-05-24', 'ev-old');
		expect(await entryOn('2026-05-24')).toBeDefined();

		await linkHealthEvent(C, '2026-05-25', 'ev-old', 'u-jlk');
		await linkHealthEvent(C, '2026-05-25', 'ev-late', 'u-jlk');
		unlinkHealthEvent(C, '2026-05-25', 'ev-old');
		expect(await entryOn('2026-05-25')).toBeDefined();
	});

	it('lists linkable events: newest first, not same-day, not already linked, display fields only', async () => {
		const entry = await entryOn('2026-05-25'); // links ev-late
		const list = await listLinkableHealthEvents(C, '2026-05-01', entry!.id);
		// ev-old is on 2026-05-01 (same day) and ev-late is linked: nothing left
		expect(list).toEqual([]);
		const open = await listLinkableHealthEvents(C, '2026-06-01', null);
		expect(open.map((e) => e.id)).toEqual(['ev-late', 'ev-old']);
		expect(Object.keys(open[0]).sort()).toEqual(['day', 'id', 'title', 'type']);
		expect(open[0].day).toBe('2026-05-10');
	});
});
