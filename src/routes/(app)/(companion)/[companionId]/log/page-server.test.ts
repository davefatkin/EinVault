import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { db, schema } from '$lib/server/db';
import { load } from './+page.server';

// Activities logged at the same time fall back to entry order, newest first,
// so every activity list agrees on the order (#344).
describe('load activity order', () => {
	const companionId = 'lps-order';

	beforeAll(async () => {
		// Pin the clock so the load's "today" matches the seeded day even if
		// the run crosses local midnight.
		vi.useFakeTimers({ toFake: ['Date'] });
		vi.setSystemTime(new Date(2026, 0, 1, 12, 0));
		await db.insert(schema.companions).values({
			id: companionId,
			name: 'Order Dog',
			species: 'dog'
		} as typeof schema.companions.$inferInsert);
		// Inserted oldest entry first: SQLite returns ties in insertion order, so
		// only the createdAt tiebreak puts the newer entry on top.
		const loggedAt = new Date(2026, 0, 1, 9, 0);
		await db.insert(schema.dailyEvents).values([
			{
				id: 'lps-order-first',
				companionId,
				type: 'walk',
				loggedAt,
				createdAt: new Date(2026, 0, 1, 9, 1)
			},
			{
				id: 'lps-order-second',
				companionId,
				type: 'meal',
				loggedAt,
				createdAt: new Date(2026, 0, 1, 9, 5)
			}
		]);
	});

	afterAll(() => {
		vi.useRealTimers();
	});

	it('breaks loggedAt ties by createdAt, newest first', async () => {
		const data = (await load({
			params: { companionId }
		} as unknown as Parameters<typeof load>[0])) as { todayEvents: { id: string }[] };

		expect(data.todayEvents.map((e) => e.id)).toEqual(['lps-order-second', 'lps-order-first']);
	});
});
