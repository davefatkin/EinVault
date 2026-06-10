import { describe, it, expect, beforeAll } from 'vitest';
import { eq } from 'drizzle-orm';
import { db, schema } from '$lib/server/db';
import { computeNextDueAt, completeReminder } from './reminders';

type Reminder = typeof schema.reminders.$inferSelect;

function reminder(partial: Partial<Reminder>): Reminder {
	return {
		isRecurring: true,
		recurrenceUnit: 'day',
		recurrenceInterval: 1,
		recurrenceAnchor: 'interval',
		recurrenceAnchorValue: null,
		dueAt: new Date(2026, 0, 15, 9, 0, 0),
		...partial
	} as Reminder;
}

describe('computeNextDueAt', () => {
	it('returns null for non-recurring reminders', () => {
		expect(computeNextDueAt(reminder({ isRecurring: false }))).toBeNull();
	});

	it('returns null for missing or invalid interval', () => {
		expect(computeNextDueAt(reminder({ recurrenceInterval: null }))).toBeNull();
		expect(computeNextDueAt(reminder({ recurrenceInterval: 0 }))).toBeNull();
		expect(computeNextDueAt(reminder({ recurrenceUnit: null }))).toBeNull();
	});

	it('advances days and weeks, preserving wall-clock time', () => {
		const daily = computeNextDueAt(reminder({ recurrenceUnit: 'day', recurrenceInterval: 3 }));
		expect(daily).toEqual(new Date(2026, 0, 18, 9, 0, 0));

		const weekly = computeNextDueAt(reminder({ recurrenceUnit: 'week', recurrenceInterval: 2 }));
		expect(weekly).toEqual(new Date(2026, 0, 29, 9, 0, 0));
	});

	it('clamps monthly advancement into short months', () => {
		const next = computeNextDueAt(
			reminder({
				recurrenceUnit: 'month',
				recurrenceInterval: 1,
				dueAt: new Date(2026, 0, 31, 9, 0, 0)
			})
		);
		expect(next).toEqual(new Date(2026, 1, 28, 9, 0, 0)); // Feb 2026 non-leap
	});

	it('recovers the anchored day after a short month (no drift)', () => {
		// Series anchored to day 31; advancing FROM the clamped Feb 28 must land
		// back on Mar 31, not Mar 28.
		const next = computeNextDueAt(
			reminder({
				recurrenceUnit: 'month',
				recurrenceInterval: 1,
				recurrenceAnchorValue: 31,
				dueAt: new Date(2026, 1, 28, 9, 0, 0)
			})
		);
		expect(next).toEqual(new Date(2026, 2, 31, 9, 0, 0));
	});

	it('handles month intervals that cross a year boundary', () => {
		const next = computeNextDueAt(
			reminder({
				recurrenceUnit: 'month',
				recurrenceInterval: 3,
				dueAt: new Date(2026, 10, 15, 9, 0, 0) // Nov 15
			})
		);
		expect(next).toEqual(new Date(2027, 1, 15, 9, 0, 0)); // Feb 15 next year
	});

	it('yearly Feb 29 clamps in non-leap years and recovers in leap years', () => {
		// packMonthDay(1, 29) = 229
		const fromLeap = computeNextDueAt(
			reminder({
				recurrenceUnit: 'year',
				recurrenceInterval: 1,
				recurrenceAnchor: 'day_of_year',
				recurrenceAnchorValue: 229,
				dueAt: new Date(2024, 1, 29, 9, 0, 0)
			})
		);
		expect(fromLeap).toEqual(new Date(2025, 1, 28, 9, 0, 0));

		const intoLeap = computeNextDueAt(
			reminder({
				recurrenceUnit: 'year',
				recurrenceInterval: 1,
				recurrenceAnchor: 'day_of_year',
				recurrenceAnchorValue: 229,
				dueAt: new Date(2027, 1, 28, 9, 0, 0)
			})
		);
		expect(intoLeap).toEqual(new Date(2028, 1, 29, 9, 0, 0));
	});
});

describe('completeReminder', () => {
	beforeAll(async () => {
		await db.insert(schema.users).values({
			id: 'u-rem',
			username: 'rem-user',
			displayName: 'Rem User',
			role: 'member'
		} as typeof schema.users.$inferInsert);
		await db.insert(schema.companions).values({
			id: 'c-rem',
			name: 'Remmy'
		} as typeof schema.companions.$inferInsert);
	});

	it('marks complete and inserts the next instance with seriesId', async () => {
		await db.insert(schema.reminders).values({
			id: 'r1',
			companionId: 'c-rem',
			title: 'Pill',
			type: 'medication',
			dueAt: new Date(2026, 0, 15, 9, 0, 0),
			isRecurring: true,
			recurrenceUnit: 'day',
			recurrenceInterval: 1,
			loggedBy: 'u-rem'
		} as typeof schema.reminders.$inferInsert);
		const row = await db.query.reminders.findFirst({ where: eq(schema.reminders.id, 'r1') });

		completeReminder(row!, 'u-rem');

		const done = await db.query.reminders.findFirst({ where: eq(schema.reminders.id, 'r1') });
		expect(done!.completedAt).not.toBeNull();
		expect(done!.completedBy).toBe('u-rem');

		const all = await db.query.reminders.findMany({
			where: eq(schema.reminders.companionId, 'c-rem')
		});
		const next = all.find((r) => r.id !== 'r1');
		expect(next).toBeDefined();
		expect(next!.seriesId).toBe('r1'); // first completion seeds seriesId from origin id
		expect(next!.completedAt).toBeNull();
		expect(next!.dueAt).toEqual(new Date(2026, 0, 16, 9, 0, 0));
	});

	it('does not insert a next instance for non-recurring reminders', async () => {
		await db.insert(schema.reminders).values({
			id: 'r2',
			companionId: 'c-rem',
			title: 'One-off',
			type: 'other',
			dueAt: new Date(2026, 0, 20, 9, 0, 0),
			isRecurring: false,
			loggedBy: 'u-rem'
		} as typeof schema.reminders.$inferInsert);
		const row = await db.query.reminders.findFirst({ where: eq(schema.reminders.id, 'r2') });
		const countBefore = (await db.query.reminders.findMany()).length;

		completeReminder(row!, 'u-rem');

		expect((await db.query.reminders.findMany()).length).toBe(countBefore);
	});
});
