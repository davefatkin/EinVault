import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { db, schema } from '$lib/server/db';
import { load } from './+page.server';

// #344: today's activity must follow when the activity happened (loggedAt),
// not when it was entered. A backdated entry is created after the entries
// it precedes.
describe('load activity order', () => {
	const companionId = 'cps-order';
	const userId = 'cps-caretaker';

	beforeAll(async () => {
		// Pin the clock so the load's "today" matches the seeded day even if
		// the run crosses local midnight.
		vi.useFakeTimers({ toFake: ['Date'] });
		vi.setSystemTime(new Date(2026, 0, 1, 12, 0));
		await db.insert(schema.users).values({
			id: userId,
			username: userId,
			displayName: 'Caretaker',
			role: 'caretaker'
		} as typeof schema.users.$inferInsert);
		await db.insert(schema.companions).values({
			id: companionId,
			name: 'Order Dog',
			species: 'dog'
		} as typeof schema.companions.$inferInsert);

		const at = (h: number, m: number) => {
			const d = new Date();
			d.setHours(h, m, 0, 0);
			return d;
		};
		await db.insert(schema.dailyEvents).values([
			{
				id: 'cps-order-late',
				companionId,
				type: 'bathroom',
				loggedAt: at(9, 50),
				createdAt: at(9, 50)
			},
			{
				id: 'cps-order-backdated',
				companionId,
				type: 'walk',
				loggedAt: at(8, 55),
				createdAt: at(10, 0)
			}
		]);
	});

	afterAll(() => {
		vi.useRealTimers();
	});

	it('orders today by loggedAt, newest first', async () => {
		const data = (await load({
			params: { companionId },
			locals: { user: { id: userId, role: 'caretaker' }, locale: 'en' },
			parent: async () => ({ companions: [{ id: companionId }], isOnShift: true })
		} as unknown as Parameters<typeof load>[0])) as { todayActivity: { id: string }[] };

		expect(data.todayActivity.map((e) => e.id)).toEqual(['cps-order-late', 'cps-order-backdated']);
	});
});
