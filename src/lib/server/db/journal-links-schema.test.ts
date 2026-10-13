import { describe, it, expect, beforeAll } from 'vitest';
import { eq } from 'drizzle-orm';
import { db, schema } from '$lib/server/db';

describe('journal_entry_health_events', () => {
	beforeAll(async () => {
		await db.insert(schema.companions).values({
			id: 'c-jl',
			name: 'Linky'
		} as typeof schema.companions.$inferInsert);
		await db.insert(schema.journalEntries).values([
			{ id: 'e-jl-1', companionId: 'c-jl', date: '2026-05-01' },
			{ id: 'e-jl-2', companionId: 'c-jl', date: '2026-05-02' }
		]);
		await db.insert(schema.healthEvents).values([
			{
				id: 'h-jl-1',
				companionId: 'c-jl',
				type: 'vet_visit',
				title: 'A',
				occurredAt: new Date(2026, 3, 1, 12)
			},
			{
				id: 'h-jl-2',
				companionId: 'c-jl',
				type: 'vet_visit',
				title: 'B',
				occurredAt: new Date(2026, 3, 2, 12)
			}
		]);
	});

	const links = () => db.select().from(schema.journalEntryHealthEvents);

	it('rejects a duplicate pair', async () => {
		await db
			.insert(schema.journalEntryHealthEvents)
			.values({ entryId: 'e-jl-1', healthEventId: 'h-jl-1' });
		await expect(
			db
				.insert(schema.journalEntryHealthEvents)
				.values({ entryId: 'e-jl-1', healthEventId: 'h-jl-1' })
		).rejects.toThrow();
	});

	it('cascades when the health event is deleted', async () => {
		await db
			.insert(schema.journalEntryHealthEvents)
			.values({ entryId: 'e-jl-2', healthEventId: 'h-jl-2' });
		await db.delete(schema.healthEvents).where(eq(schema.healthEvents.id, 'h-jl-2'));
		expect((await links()).some((l) => l.healthEventId === 'h-jl-2')).toBe(false);
	});

	it('cascades when the journal entry is deleted', async () => {
		await db
			.insert(schema.journalEntryHealthEvents)
			.values({ entryId: 'e-jl-1', healthEventId: 'h-jl-1' })
			.onConflictDoNothing();
		expect((await links()).some((l) => l.entryId === 'e-jl-1')).toBe(true);
		await db.delete(schema.journalEntries).where(eq(schema.journalEntries.id, 'e-jl-1'));
		expect((await links()).some((l) => l.entryId === 'e-jl-1')).toBe(false);
	});
});
