import { describe, it, expect, beforeAll } from 'vitest';
import { and, eq, isNull } from 'drizzle-orm';
import { db, schema } from '#lib/server/db/index.js';
import { localDateISO } from '#lib/date.js';
import { computeNextDueAt, completeReminder, skipReminder } from './reminders';

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

	it('returns the completedAt and the spawned next id for a recurring reminder', async () => {
		await db.insert(schema.reminders).values({
			id: 'r3',
			companionId: 'c-rem',
			title: 'Weekly check',
			type: 'other',
			dueAt: new Date(2026, 0, 15, 9, 0, 0),
			isRecurring: true,
			recurrenceUnit: 'week',
			recurrenceInterval: 1,
			seriesId: 'r3',
			loggedBy: 'u-rem'
		} as typeof schema.reminders.$inferInsert);
		const row = await db.query.reminders.findFirst({ where: eq(schema.reminders.id, 'r3') });

		const res = completeReminder(row!, 'u-rem');

		expect(res).not.toBeNull();
		expect(res!.completedAt).toBeInstanceOf(Date);
		expect(typeof res!.nextReminderId).toBe('string');

		const next = await db.query.reminders.findFirst({
			where: eq(schema.reminders.id, res!.nextReminderId!)
		});
		expect(next).toBeDefined();
		expect(next!.seriesId).toBe('r3');
	});

	it('returns nextReminderId null for a one-off reminder', async () => {
		await db.insert(schema.reminders).values({
			id: 'r4',
			companionId: 'c-rem',
			title: 'One-off 2',
			type: 'other',
			dueAt: new Date(2026, 0, 21, 9, 0, 0),
			isRecurring: false,
			loggedBy: 'u-rem'
		} as typeof schema.reminders.$inferInsert);
		const row = await db.query.reminders.findFirst({ where: eq(schema.reminders.id, 'r4') });

		const res = completeReminder(row!, 'u-rem');

		expect(res).not.toBeNull();
		expect(res!.nextReminderId).toBeNull();
	});

	it('returns null and spawns nothing for a second complete on an already-completed reminder', async () => {
		await db.insert(schema.reminders).values({
			id: 'r5',
			companionId: 'c-rem',
			title: 'Daily race',
			type: 'other',
			dueAt: new Date(2026, 0, 22, 9, 0, 0),
			isRecurring: true,
			recurrenceUnit: 'day',
			recurrenceInterval: 1,
			seriesId: 'r5',
			loggedBy: 'u-rem'
		} as typeof schema.reminders.$inferInsert);
		const row = await db.query.reminders.findFirst({ where: eq(schema.reminders.id, 'r5') });

		const first = completeReminder(row!, 'u-rem');
		expect(first).not.toBeNull();
		expect(typeof first!.nextReminderId).toBe('string');

		const countAfterFirst = (
			await db.query.reminders.findMany({ where: eq(schema.reminders.seriesId, 'r5') })
		).length;

		// Simulate a concurrent/duplicate complete on the same (stale, pre-completion)
		// row snapshot — the atomic UPDATE guard should no-op and skip the spawn.
		const second = completeReminder(row!, 'u-rem');
		expect(second).toBeNull();

		const countAfterSecond = (
			await db.query.reminders.findMany({ where: eq(schema.reminders.seriesId, 'r5') })
		).length;
		expect(countAfterSecond).toBe(countAfterFirst);
	});
});

describe('skipReminder', () => {
	it('marks the row skipped and spawns the next occurrence', async () => {
		const id = 'skip-1';
		await db.insert(schema.reminders).values({
			id,
			companionId: 'c-rem',
			title: 'Heartworm chew',
			type: 'medication',
			dueAt: new Date(2026, 0, 15, 9, 0, 0),
			isRecurring: true,
			recurrenceUnit: 'month',
			recurrenceInterval: 1,
			seriesId: id,
			loggedBy: 'u-rem'
		} as typeof schema.reminders.$inferInsert);
		const row = (await db.query.reminders.findFirst({
			where: eq(schema.reminders.id, id)
		}))!;

		const result = skipReminder(row, 'u-rem');
		expect(result).not.toBeNull();
		expect(result!.nextReminderId).not.toBeNull();

		const after = (await db.query.reminders.findFirst({
			where: eq(schema.reminders.id, id)
		}))!;
		expect(after.completedAt).not.toBeNull();
		expect(after.completedBy).toBe('u-rem');
		expect(after.outcome).toBe('skipped');

		const next = (await db.query.reminders.findFirst({
			where: eq(schema.reminders.id, result!.nextReminderId!)
		}))!;
		expect(next.dueAt).toEqual(new Date(2026, 1, 15, 9, 0, 0));
		expect(next.seriesId).toBe(id);
		expect(next.completedAt).toBeNull();
		expect(next.outcome).toBeNull();
	});

	it('is a no-op returning null when already resolved', async () => {
		const id = 'skip-2';
		await db.insert(schema.reminders).values({
			id,
			companionId: 'c-rem',
			title: 'Weekly check',
			type: 'other',
			dueAt: new Date(2026, 0, 15, 9, 0, 0),
			isRecurring: true,
			recurrenceUnit: 'week',
			recurrenceInterval: 1,
			seriesId: id,
			loggedBy: 'u-rem'
		} as typeof schema.reminders.$inferInsert);
		const row = (await db.query.reminders.findFirst({
			where: eq(schema.reminders.id, id)
		}))!;

		const first = skipReminder(row, 'u-rem');
		expect(first).not.toBeNull();
		expect(typeof first!.nextReminderId).toBe('string');

		const countAfterFirst = (
			await db.query.reminders.findMany({ where: eq(schema.reminders.seriesId, id) })
		).length;

		// Simulate a duplicate skip on the same (stale, pre-resolution) row snapshot
		// — the atomic UPDATE guard should no-op and skip the spawn.
		const second = skipReminder(row, 'u-rem');
		expect(second).toBeNull();

		const countAfterSecond = (
			await db.query.reminders.findMany({ where: eq(schema.reminders.seriesId, id) })
		).length;
		expect(countAfterSecond).toBe(countAfterFirst);
	});

	it('returns null and writes nothing for non-recurring reminders', async () => {
		const id = 'skip-3';
		await db.insert(schema.reminders).values({
			id,
			companionId: 'c-rem',
			title: 'One-off',
			type: 'other',
			dueAt: new Date(2026, 0, 20, 9, 0, 0),
			isRecurring: false,
			loggedBy: 'u-rem'
		} as typeof schema.reminders.$inferInsert);
		const row = (await db.query.reminders.findFirst({
			where: eq(schema.reminders.id, id)
		}))!;
		const countBefore = (await db.query.reminders.findMany()).length;

		const result = skipReminder(row, 'u-rem');
		expect(result).toBeNull();

		const after = (await db.query.reminders.findFirst({
			where: eq(schema.reminders.id, id)
		}))!;
		expect(after.completedAt).toBeNull();
		expect((await db.query.reminders.findMany()).length).toBe(countBefore);
	});
});

describe('completeReminder outcome', () => {
	it('stamps outcome completed', async () => {
		const id = 'complete-outcome-1';
		await db.insert(schema.reminders).values({
			id,
			companionId: 'c-rem',
			title: 'Pill',
			type: 'medication',
			dueAt: new Date(2026, 0, 15, 9, 0, 0),
			isRecurring: false,
			loggedBy: 'u-rem'
		} as typeof schema.reminders.$inferInsert);
		const row = (await db.query.reminders.findFirst({
			where: eq(schema.reminders.id, id)
		}))!;

		completeReminder(row, 'u-rem');

		const after = (await db.query.reminders.findFirst({
			where: eq(schema.reminders.id, id)
		}))!;
		expect(after.outcome).toBe('completed');
	});
});

describe('lead times carry to the next occurrence', () => {
	for (const [name, fn] of [
		['completeReminder', completeReminder],
		['skipReminder', skipReminder]
	] as const) {
		it(`${name} copies notifyLeadDays and arms the new row`, async () => {
			const id = `lead-carry-${name}`;
			await db.insert(schema.reminders).values({
				id,
				companionId: 'c-rem',
				title: 'Weekly',
				type: 'other',
				dueAt: new Date(2026, 0, 15, 9, 0, 0),
				isRecurring: true,
				recurrenceUnit: 'week',
				recurrenceInterval: 1,
				seriesId: id,
				notifyLeadDays: '2',
				loggedBy: 'u-rem'
			} as typeof schema.reminders.$inferInsert);
			const row = (await db.query.reminders.findFirst({
				where: eq(schema.reminders.id, id)
			}))!;
			const before = Date.now();
			const res = fn(row, 'u-rem')!;
			const next = (await db.query.reminders.findFirst({
				where: eq(schema.reminders.id, res.nextReminderId!)
			}))!;
			expect(next.notifyLeadDays).toBe('2');
			expect(next.leadArmedAt).toBeInstanceOf(Date);
			expect(Math.abs(next.leadArmedAt!.getTime() - before)).toBeLessThan(5000);
		});
	}

	it('leaves a reminder without leads unarmed', async () => {
		const id = 'lead-carry-none';
		await db.insert(schema.reminders).values({
			id,
			companionId: 'c-rem',
			title: 'Plain',
			type: 'other',
			dueAt: new Date(2026, 0, 15, 9, 0, 0),
			isRecurring: true,
			recurrenceUnit: 'week',
			recurrenceInterval: 1,
			seriesId: id,
			loggedBy: 'u-rem'
		} as typeof schema.reminders.$inferInsert);
		const row = (await db.query.reminders.findFirst({ where: eq(schema.reminders.id, id) }))!;
		const res = completeReminder(row, 'u-rem')!;
		const next = (await db.query.reminders.findFirst({
			where: eq(schema.reminders.id, res.nextReminderId!)
		}))!;
		expect(next.notifyLeadDays).toBeNull();
		expect(next.leadArmedAt).toBeNull();
	});
});

describe('medication-linked reminders', () => {
	let k = 0;
	async function med(endedOn: string | null = null) {
		const id = `med-rem-${++k}`;
		await db.insert(schema.medications).values({
			id,
			companionId: 'c-rem',
			name: 'Carprofen',
			startedOn: '2026-01-01',
			endedOn
		});
		return id;
	}
	async function linked(medicationId: string, dueAt = new Date(2026, 0, 15, 9, 0, 0)) {
		const id = `med-rem-r-${++k}`;
		await db.insert(schema.reminders).values({
			id,
			companionId: 'c-rem',
			title: 'Pill',
			type: 'medication',
			dueAt,
			isRecurring: true,
			recurrenceUnit: 'day',
			recurrenceInterval: 1,
			seriesId: id,
			medicationId,
			loggedBy: 'u-rem'
		} as typeof schema.reminders.$inferInsert);
		return (await db.query.reminders.findFirst({ where: eq(schema.reminders.id, id) }))!;
	}
	const dosesFor = (medicationId: string) =>
		db.query.medicationDoses.findMany({
			where: eq(schema.medicationDoses.medicationId, medicationId)
		});

	it('completing writes one reminder dose and links the next occurrence', async () => {
		const m = await med();
		const r = await linked(m);
		const res = completeReminder(r, 'u-rem')!;
		const doses = await dosesFor(m);
		expect(doses).toHaveLength(1);
		expect(doses[0]).toMatchObject({
			id: res.doseId,
			source: 'reminder',
			reminderId: r.id,
			givenBy: 'u-rem',
			givenAt: new Date(Math.floor(res.completedAt.getTime() / 1000) * 1000)
		});
		const next = (await db.query.reminders.findFirst({
			where: eq(schema.reminders.id, res.nextReminderId!)
		}))!;
		expect(next.medicationId).toBe(m);
	});

	it('a second complete on the same snapshot writes no second dose', async () => {
		const m = await med();
		const r = await linked(m);
		completeReminder(r, 'u-rem');
		expect(completeReminder(r, 'u-rem')).toBeNull();
		expect(await dosesFor(m)).toHaveLength(1);
	});

	it('skipping writes no dose but keeps the link on the next occurrence', async () => {
		const m = await med();
		const r = await linked(m);
		const res = skipReminder(r, 'u-rem')!;
		expect(await dosesFor(m)).toHaveLength(0);
		const next = (await db.query.reminders.findFirst({
			where: eq(schema.reminders.id, res.nextReminderId!)
		}))!;
		expect(next.medicationId).toBe(m);
	});

	it('unlinked reminders write no dose', async () => {
		const before = (await db.query.medicationDoses.findMany()).length;
		await db.insert(schema.reminders).values({
			id: 'med-rem-plain',
			companionId: 'c-rem',
			title: 'Plain',
			type: 'other',
			dueAt: new Date(2026, 0, 15, 9, 0, 0),
			isRecurring: false,
			loggedBy: 'u-rem'
		} as typeof schema.reminders.$inferInsert);
		const r = (await db.query.reminders.findFirst({
			where: eq(schema.reminders.id, 'med-rem-plain')
		}))!;
		expect(completeReminder(r, 'u-rem')!.doseId).toBeNull();
		expect((await db.query.medicationDoses.findMany()).length).toBe(before);
	});

	it('a course stops by itself: no occurrence spawns past ended_on', async () => {
		// Daily 9:00 reminder from today; the course ends tomorrow (inclusive).
		const now = new Date();
		const day = (offset: number) =>
			new Date(now.getFullYear(), now.getMonth(), now.getDate() + offset, 9, 0, 0);
		const m = await med(localDateISO(day(1)));
		const today = await linked(m, day(0));
		const first = completeReminder(today, 'u-rem')!;
		expect(first.nextReminderId).not.toBeNull();
		const tomorrow = (await db.query.reminders.findFirst({
			where: eq(schema.reminders.id, first.nextReminderId!)
		}))!;
		expect(tomorrow.dueAt).toEqual(day(1));
		const last = completeReminder(tomorrow, 'u-rem')!;
		expect(last.nextReminderId).toBeNull();
		expect(await dosesFor(m)).toHaveLength(2);
		const open = await db.query.reminders.findMany({
			where: and(eq(schema.reminders.medicationId, m), isNull(schema.reminders.completedAt))
		});
		expect(open).toHaveLength(0);
	});

	it('completing after the medication ended writes no dose and spawns nothing', async () => {
		// Ended long ago; the next occurrence would still fall on or before ended_on.
		const m = await med('2000-01-10');
		const r = await linked(m, new Date(2000, 0, 1, 9, 0, 0));
		const res = completeReminder(r, 'u-rem')!;
		expect(res).toMatchObject({ doseId: null, nextReminderId: null });
		const done = (await db.query.reminders.findFirst({ where: eq(schema.reminders.id, r.id) }))!;
		expect(done.outcome).toBe('completed');
		expect(await dosesFor(m)).toHaveLength(0);
	});

	it('skipping the last day of a course spawns nothing either', async () => {
		const m = await med('2026-01-15');
		const r = await linked(m, new Date(2026, 0, 15, 9, 0, 0));
		expect(skipReminder(r, 'u-rem')!.nextReminderId).toBeNull();
	});

	it('a link to a deleted medication writes no dose and does not throw', async () => {
		const m = await med();
		const r = await linked(m);
		await db.delete(schema.medications).where(eq(schema.medications.id, m));
		// r is a stale snapshot that still carries medicationId.
		const res = completeReminder(r, 'u-rem')!;
		expect(res.doseId).toBeNull();
		const next = (await db.query.reminders.findFirst({
			where: eq(schema.reminders.id, res.nextReminderId!)
		}))!;
		expect(next.medicationId).toBeNull();
	});

	it('uses the given time and note for the dose when passed', async () => {
		const m = await med();
		const r = await linked(m);
		const givenAt = new Date(2026, 0, 15, 8, 55, 0);
		const res = completeReminder(r, 'u-rem', { givenAt, note: 'with food' })!;
		const [dose] = await dosesFor(m);
		expect(dose).toMatchObject({ id: res.doseId, givenAt, note: 'with food' });
	});

	async function withSupply(m: string, quantity: number) {
		const supplyId = `sup-rem-${++k}`;
		await db
			.insert(schema.supplies)
			.values({ id: supplyId, name: 'Pills', kind: 'counted', quantity });
		await db.update(schema.medications).set({ supplyId }).where(eq(schema.medications.id, m));
		return supplyId;
	}
	const stock = async (supplyId: string) =>
		(await db.query.supplies.findFirst({ where: eq(schema.supplies.id, supplyId) }))!.quantity;
	const usesOf = (supplyId: string) =>
		db.query.supplyEvents.findMany({ where: eq(schema.supplyEvents.supplyId, supplyId) });

	it('completing subtracts one dose from the supply, once', async () => {
		const m = await med();
		const s = await withSupply(m, 10);
		const r = await linked(m);
		const givenAt = new Date(2026, 0, 15, 8, 55, 0);
		const res = completeReminder(r, 'u-rem', { givenAt })!;
		expect(completeReminder(r, 'u-rem')).toBeNull();
		expect(await stock(s)).toBe(9);
		const uses = await usesOf(s);
		expect(uses).toHaveLength(1);
		expect(uses[0]).toMatchObject({
			type: 'use',
			quantityDelta: -1,
			doseId: res.doseId,
			companionId: 'c-rem',
			at: givenAt
		});
	});

	it('skipping leaves the supply alone', async () => {
		const m = await med();
		const s = await withSupply(m, 10);
		skipReminder(await linked(m), 'u-rem');
		expect(await stock(s)).toBe(10);
		expect(await usesOf(s)).toEqual([]);
	});
});
