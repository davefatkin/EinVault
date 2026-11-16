import { describe, it, expect, beforeAll } from 'vitest';
import { eq } from 'drizzle-orm';
import { db, schema } from '$lib/server/db';
import {
	computeNextDueAt,
	completeReminder,
	skipReminder,
	restoreReminder,
	mistapDose,
	takeBackDose,
	withMistap
} from './reminders';

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

// Narrow a completeReminder result to a resolved dose, failing the test otherwise.
function dosed(res: ReturnType<typeof completeReminder>) {
	if (!res || res === 'noPillsLeft') throw new Error(`expected a resolved dose, got ${res}`);
	return res;
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

		const res = dosed(completeReminder(row!, 'u-rem'));

		expect(res.completedAt).toBeInstanceOf(Date);
		expect(typeof res.nextReminderId).toBe('string');

		const next = await db.query.reminders.findFirst({
			where: eq(schema.reminders.id, res.nextReminderId!)
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

		const res = dosed(completeReminder(row!, 'u-rem'));

		expect(res.nextReminderId).toBeNull();
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

		const first = dosed(completeReminder(row!, 'u-rem'));
		expect(typeof first.nextReminderId).toBe('string');

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

describe('medication pill count', () => {
	async function insertMed(id: string, pillsLeft: number | null, isRecurring = true) {
		await db.insert(schema.reminders).values({
			id,
			companionId: 'c-rem',
			title: 'Carprofen',
			type: 'medication',
			dueAt: new Date(2026, 2, 1, 8, 0, 0),
			isRecurring,
			recurrenceUnit: isRecurring ? 'day' : null,
			recurrenceInterval: isRecurring ? 1 : null,
			seriesId: isRecurring ? id : null,
			pillsLeft,
			loggedBy: 'u-rem'
		} as typeof schema.reminders.$inferInsert);
		return (await db.query.reminders.findFirst({ where: eq(schema.reminders.id, id) }))!;
	}
	const get = async (id: string) =>
		(await db.query.reminders.findFirst({ where: eq(schema.reminders.id, id) }))!;
	const series = async (id: string) =>
		db.query.reminders.findMany({ where: eq(schema.reminders.seriesId, id) });

	it('a dose closes the occurrence, burns one pill, and keeps the schedule', async () => {
		const row = await insertMed('med-1', 10);

		const res = dosed(completeReminder(row, 'u-rem'));
		expect(res.pillsLeft).toBe(9);

		const done = await get('med-1');
		expect(done.completedAt).not.toBeNull();
		expect(done.outcome).toBe('completed');
		expect(done.pillsLeft).toBe(9);

		const next = await get(res.nextReminderId!);
		expect(next.completedAt).toBeNull();
		expect(next.pillsLeft).toBe(9);
		expect(next.dueAt).toEqual(new Date(2026, 2, 2, 8, 0, 0));
		expect(next.seriesId).toBe('med-1');
	});

	it('refuses a dose with none left and leaves the occurrence open', async () => {
		const row = await insertMed('med-2', 0);

		expect(completeReminder(row, 'u-rem')).toBe('noPillsLeft');

		const after = await get('med-2');
		expect(after.completedAt).toBeNull();
		expect(after.outcome).toBeNull();
		expect(after.pillsLeft).toBe(0);
		expect(await series('med-2')).toHaveLength(1);
	});

	it('a second dose for the same occurrence burns nothing', async () => {
		const row = await insertMed('med-3', 5);

		const first = dosed(completeReminder(row, 'u-rem'));
		// Stale pre-completion snapshot, as a double-click or retry would send.
		expect(completeReminder(row, 'u-rem')).toBeNull();

		expect((await get('med-3')).pillsLeft).toBe(4);
		expect((await get(first.nextReminderId!)).pillsLeft).toBe(4);
		expect(await series('med-3')).toHaveLength(2);
	});

	it('a skip burns nothing and carries the count to the next occurrence', async () => {
		const row = await insertMed('med-4', 3);

		const res = skipReminder(row, 'u-rem');
		expect(res!.pillsLeft).toBe(3);
		expect((await get('med-4')).pillsLeft).toBe(3);
		expect((await get(res!.nextReminderId!)).pillsLeft).toBe(3);
	});

	it('a skip is allowed with none left', async () => {
		const row = await insertMed('med-5', 0);
		const res = skipReminder(row, 'u-rem');
		expect(res).not.toBeNull();
		expect((await get(res!.nextReminderId!)).pillsLeft).toBe(0);
	});

	it('reads the live count, not the caller snapshot (refill after load)', async () => {
		const stale = await insertMed('med-6', 0);
		await db
			.update(schema.reminders)
			.set({ pillsLeft: 30 })
			.where(eq(schema.reminders.id, 'med-6'));

		const res = dosed(completeReminder(stale, 'u-rem'));
		expect(res.pillsLeft).toBe(29);
	});

	it('restore of a dose reopens the occurrence and puts the pill back', async () => {
		const row = await insertMed('med-7', 2);
		expect(dosed(completeReminder(row, 'u-rem')).pillsLeft).toBe(1);

		expect(restoreReminder(await get('med-7'))).toBe(true);

		const after = await get('med-7');
		expect(after.completedAt).toBeNull();
		expect(after.outcome).toBeNull();
		expect(after.pillsLeft).toBe(2);
		// The spawned next occurrence is gone; the series rewinds to this one.
		expect(await series('med-7')).toHaveLength(1);

		// A double-submitted restore is a no-op (no second pill handed back).
		expect(restoreReminder(after)).toBe(false);
		expect((await get('med-7')).pillsLeft).toBe(2);
	});

	it('restore of a skip leaves the count alone', async () => {
		const row = await insertMed('med-8', 4);
		skipReminder(row, 'u-rem');

		restoreReminder(await get('med-8'));
		expect((await get('med-8')).pillsLeft).toBe(4);
	});

	it('one-off dose burns a pill; untracked reminders are unaffected', async () => {
		const once = await insertMed('med-9', 1, false);
		const res = dosed(completeReminder(once, 'u-rem'));
		expect(res.nextReminderId).toBeNull();
		expect(res.pillsLeft).toBe(0);

		const untracked = await insertMed('med-10', null);
		const res2 = dosed(completeReminder(untracked, 'u-rem'));
		expect(res2.pillsLeft).toBeNull();
		expect((await get(res2.nextReminderId!)).pillsLeft).toBeNull();
	});
});

describe('mistap', () => {
	async function insertMed(
		id: string,
		pillsLeft: number | null,
		type: Reminder['type'] = 'medication'
	) {
		await db.insert(schema.reminders).values({
			id,
			companionId: 'c-rem',
			title: 'Mistap med',
			type,
			dueAt: new Date(2026, 3, 1, 8, 0, 0),
			isRecurring: true,
			recurrenceUnit: 'day',
			recurrenceInterval: 1,
			seriesId: id,
			pillsLeft,
			loggedBy: 'u-rem'
		} as typeof schema.reminders.$inferInsert);
		return (await db.query.reminders.findFirst({ where: eq(schema.reminders.id, id) }))!;
	}
	const get = async (id: string) =>
		db.query.reminders.findFirst({ where: eq(schema.reminders.id, id) });
	const series = async (id: string) =>
		db.query.reminders.findMany({ where: eq(schema.reminders.seriesId, id) });

	it('points the next occurrence at the dose it follows', async () => {
		const row = await insertMed('mt-1', 5);
		const dose = dosed(completeReminder(row, 'u-rem'));
		const next = (await get(dose.nextReminderId!))!;

		const [annotated] = await withMistap([next]);
		expect(annotated.mistapId).toBe('mt-1');
		expect(annotated.mistapAt).toEqual((await get('mt-1'))!.completedAt);
	});

	it('offers nothing after a skip, before any dose, or for non-medication', async () => {
		const skipped = await insertMed('mt-2', 5);
		const afterSkip = (await get(skipReminder(skipped, 'u-rem')!.nextReminderId!))!;
		const fresh = await insertMed('mt-3', 5);
		const vet = await insertMed('mt-4', null, 'vet');
		const afterVet = (await get(dosed(completeReminder(vet, 'u-rem')).nextReminderId!))!;

		const annotated = await withMistap([afterSkip, fresh, afterVet]);
		expect(annotated.map((r) => r.mistapId)).toEqual([null, null, null]);
	});

	it('takes the dose back: occurrence reopened, pill returned, spawned row gone', async () => {
		const row = await insertMed('mt-5', 3);
		const dose = dosed(completeReminder(row, 'u-rem'));
		const next = (await get(dose.nextReminderId!))!;
		expect(next.pillsLeft).toBe(2);

		expect(mistapDose(next, 'mt-5')).toBe(true);

		const back = (await get('mt-5'))!;
		expect(back.completedAt).toBeNull();
		expect(back.outcome).toBeNull();
		expect(back.pillsLeft).toBe(3);
		expect(await get(next.id)).toBeUndefined();
		expect(await series('mt-5')).toHaveLength(1);
	});

	it('a double click takes back only one dose', async () => {
		const row = await insertMed('mt-6', 4);
		const first = dosed(completeReminder(row, 'u-rem'));
		const second = dosed(completeReminder((await get(first.nextReminderId!))!, 'u-rem'));
		const open = (await get(second.nextReminderId!))!;
		expect(open.pillsLeft).toBe(2);

		expect(mistapDose(open, first.nextReminderId!)).toBe(true);
		// Replayed with the same (now deleted) open row and dose id.
		expect(mistapDose(open, first.nextReminderId!)).toBe(false);

		expect((await get(first.nextReminderId!))!.pillsLeft).toBe(3);
		expect((await get('mt-6'))!.completedAt).not.toBeNull();
		expect(await series('mt-6')).toHaveLength(2);
	});

	it('refuses a stale dose id or an occurrence that was already dosed', async () => {
		const row = await insertMed('mt-7', 4);
		const first = dosed(completeReminder(row, 'u-rem'));
		const next = (await get(first.nextReminderId!))!;

		expect(mistapDose(next, 'not-the-dose')).toBe(false);

		// Someone else doses `next` before the Mistap arrives.
		dosed(completeReminder(next, 'u-rem'));
		expect(mistapDose(next, 'mt-7')).toBe(false);
		expect((await get('mt-7'))!.completedAt).not.toBeNull();
		expect(await series('mt-7')).toHaveLength(3);
	});
});

describe('takeBackDose', () => {
	async function insertMed(id: string, pillsLeft: number | null, isRecurring = true) {
		await db.insert(schema.reminders).values({
			id,
			companionId: 'c-rem',
			title: 'Take back med',
			type: 'medication',
			dueAt: new Date(2026, 4, 1, 8, 0, 0),
			isRecurring,
			recurrenceUnit: isRecurring ? 'day' : null,
			recurrenceInterval: isRecurring ? 1 : null,
			seriesId: isRecurring ? id : null,
			pillsLeft,
			loggedBy: 'u-rem'
		} as typeof schema.reminders.$inferInsert);
		return (await db.query.reminders.findFirst({ where: eq(schema.reminders.id, id) }))!;
	}
	const get = async (id: string) =>
		db.query.reminders.findFirst({ where: eq(schema.reminders.id, id) });

	it('reopens the dose by its own id with the pill back; a second call adds nothing', async () => {
		const dose = dosed(completeReminder(await insertMed('tb-1', 6), 'u-rem'));
		expect(dose.pillsLeft).toBe(5);

		const reopened = takeBackDose('tb-1');
		expect(reopened).not.toBeNull();
		expect(reopened!.completedAt).toBeNull();
		expect(reopened!.outcome).toBeNull();
		expect(reopened!.pillsLeft).toBe(6);
		expect(await get(dose.nextReminderId!)).toBeUndefined();

		expect(takeBackDose('tb-1')).toBeNull();
		expect((await get('tb-1'))!.pillsLeft).toBe(6);
	});

	it('refuses a dose that a later dose or skip came after', async () => {
		const first = dosed(completeReminder(await insertMed('tb-2', 6), 'u-rem'));
		skipReminder((await get(first.nextReminderId!))!, 'u-rem');

		expect(takeBackDose('tb-2')).toBeNull();
		expect((await get('tb-2'))!.completedAt).not.toBeNull();
		expect((await get(first.nextReminderId!))!.outcome).toBe('skipped');
	});

	it('refuses a skip, an open occurrence, and an unknown id', async () => {
		const skip = skipReminder(await insertMed('tb-3', 2), 'u-rem')!;
		expect(takeBackDose('tb-3')).toBeNull();
		expect(takeBackDose(skip.nextReminderId!)).toBeNull();
		expect(takeBackDose('tb-nope')).toBeNull();
	});

	it('takes back a one-off dose', async () => {
		dosed(completeReminder(await insertMed('tb-4', 1, false), 'u-rem'));
		const reopened = takeBackDose('tb-4');
		expect(reopened!.completedAt).toBeNull();
		expect(reopened!.pillsLeft).toBe(1);
	});
});

describe('dose keeps the schedule across short months and leap days', () => {
	async function walk(id: string, partial: Partial<Reminder>, doses: number) {
		await db.insert(schema.reminders).values({
			id,
			companionId: 'c-rem',
			title: 'Schedule walk',
			type: 'medication',
			isRecurring: true,
			recurrenceInterval: 1,
			recurrenceAnchor: 'interval',
			seriesId: id,
			pillsLeft: 100,
			loggedBy: 'u-rem',
			...partial
		} as typeof schema.reminders.$inferInsert);
		let row = (await db.query.reminders.findFirst({ where: eq(schema.reminders.id, id) }))!;
		const dues = [row.dueAt];
		for (let i = 0; i < doses; i++) {
			const next = dosed(completeReminder(row, 'u-rem')).nextReminderId!;
			row = (await db.query.reminders.findFirst({ where: eq(schema.reminders.id, next) }))!;
			dues.push(row.dueAt);
		}
		return dues;
	}

	it('monthly on the 31st: clamps in short months and returns to the 31st', async () => {
		// anchorValue 31 is what the add form stores for a Jan 31 interval series.
		const dues = await walk(
			'sched-m31',
			{ recurrenceUnit: 'month', recurrenceAnchorValue: 31, dueAt: new Date(2026, 0, 31, 8, 0) },
			4
		);
		expect(dues).toEqual([
			new Date(2026, 0, 31, 8, 0),
			new Date(2026, 1, 28, 8, 0),
			new Date(2026, 2, 31, 8, 0),
			new Date(2026, 3, 30, 8, 0),
			new Date(2026, 4, 31, 8, 0)
		]);
	});

	it('yearly on Feb 29: Feb 28 in common years, back to Feb 29 in the next leap year', async () => {
		const dues = await walk(
			'sched-y229',
			{ recurrenceUnit: 'year', recurrenceAnchorValue: 229, dueAt: new Date(2028, 1, 29, 8, 0) },
			4
		);
		expect(dues).toEqual([
			new Date(2028, 1, 29, 8, 0),
			new Date(2029, 1, 28, 8, 0),
			new Date(2030, 1, 28, 8, 0),
			new Date(2031, 1, 28, 8, 0),
			new Date(2032, 1, 29, 8, 0)
		]);
	});
});
