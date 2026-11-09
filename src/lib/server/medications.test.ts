import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest';
import { eq } from 'drizzle-orm';
import { db, schema } from '#lib/server/db/index.js';
import {
	parseMedicationForm,
	createMedication,
	getMedication,
	updateMedication,
	endMedication,
	restartMedication,
	deleteMedication,
	listMedicationSummaries,
	listDoses,
	sweepEndedMedicationReminders,
	logDose,
	startMedicationSweep,
	type MedicationInput
} from './medications';

const C1 = 'c-med-1';
const C2 = 'c-med-2';
const U1 = 'u-med-1';
const TODAY = '2026-11-09';

function input(p: Partial<MedicationInput> = {}): MedicationInput {
	return {
		name: 'Carprofen',
		dose: null,
		instructions: null,
		startedOn: '2026-11-01',
		endedOn: null,
		...p
	};
}

let n = 0;
async function addReminder(medicationId: string | null, completed = false, dueAt = new Date(1e12)) {
	const id = `r-med-${++n}`;
	await db.insert(schema.reminders).values({
		id,
		companionId: C1,
		title: 'Pill',
		type: 'medication',
		dueAt,
		medicationId,
		completedAt: completed ? new Date() : null,
		outcome: completed ? 'completed' : null,
		isRecurring: true,
		recurrenceUnit: 'day',
		recurrenceInterval: 1,
		recurrenceAnchor: 'interval'
	});
	return id;
}
async function reminderIds() {
	return (await db.select({ id: schema.reminders.id }).from(schema.reminders)).map((r) => r.id);
}
async function addDose(medicationId: string, at: number, by: string | null = U1) {
	const id = `d-med-${++n}`;
	await db.insert(schema.medicationDoses).values({
		id,
		medicationId,
		givenAt: new Date(at * 1000),
		givenBy: by,
		source: 'manual'
	});
	return id;
}

beforeAll(async () => {
	await db.insert(schema.companions).values([
		{ id: C1, name: 'Rex' },
		{ id: C2, name: 'Bo' }
	]);
	await db
		.insert(schema.users)
		.values({ id: U1, username: 'm1', displayName: 'Jet', role: 'member', passwordHash: 'x' });
});

beforeEach(async () => {
	await db.delete(schema.reminders);
	await db.delete(schema.medications);
});

describe('parseMedicationForm', () => {
	const form = (o: Record<string, string>) => {
		const f = new FormData();
		for (const [k, v] of Object.entries(o)) f.set(k, v);
		return f;
	};
	const base = { name: ' Pill ', startedOn: '2026-11-01' };
	it('parses and normalizes', () => {
		expect(parseMedicationForm(form({ ...base, dose: ' 1 ' }), 'en')).toEqual({
			ok: true,
			value: { name: 'Pill', dose: '1', instructions: null, startedOn: '2026-11-01', endedOn: null }
		});
	});
	it('defaults an empty or missing start date to today', () => {
		const r = parseMedicationForm(form({ name: 'Pill', startedOn: '' }), 'en', TODAY);
		expect(r).toMatchObject({ ok: true, value: { startedOn: TODAY } });
		expect(parseMedicationForm(form({ name: 'Pill' }), 'en', TODAY)).toMatchObject({
			ok: true,
			value: { startedOn: TODAY }
		});
	});
	it('rejects missing name, bad dates, end before start, long fields', () => {
		expect(parseMedicationForm(form({ ...base, name: ' ' }), 'en').ok).toBe(false);
		expect(parseMedicationForm(form({ ...base, startedOn: '2026-13-01' }), 'en').ok).toBe(false);
		expect(parseMedicationForm(form({ ...base, startedOn: 'junk' }), 'en').ok).toBe(false);
		expect(parseMedicationForm(form({ ...base, endedOn: 'nope' }), 'en').ok).toBe(false);
		expect(parseMedicationForm(form({ ...base, endedOn: '2026-10-31' }), 'en').ok).toBe(false);
		expect(parseMedicationForm(form({ ...base, instructions: 'x'.repeat(5001) }), 'en').ok).toBe(
			false
		);
		expect(parseMedicationForm(form({ ...base, endedOn: '2026-11-01' }), 'en').ok).toBe(true);
	});
});

describe('create / get', () => {
	it('is companion-scoped', async () => {
		const id = await createMedication(C1, input({ dose: '1 tab' }), U1);
		expect(await getMedication(C1, id)).toMatchObject({
			id,
			name: 'Carprofen',
			dose: '1 tab',
			loggedBy: U1
		});
		expect(await getMedication(C2, id)).toBeUndefined();
	});
});

describe('endMedication', () => {
	it('sets ended_on and deletes open linked reminders, keeping completed ones', async () => {
		const id = await createMedication(C1, input(), U1);
		const open = await addReminder(id);
		const done = await addReminder(id, true);
		const other = await addReminder(null);
		expect(await endMedication(C1, id, TODAY)).toBe(true);
		expect((await getMedication(C1, id))?.endedOn).toBe(TODAY);
		const left = await reminderIds();
		expect(left).not.toContain(open);
		expect(left).toEqual(expect.arrayContaining([done, other]));
	});
	it('refuses another companion', async () => {
		const id = await createMedication(C1, input(), U1);
		const open = await addReminder(id);
		expect(await endMedication(C2, id, TODAY)).toBe(false);
		expect(await reminderIds()).toContain(open);
	});
});

describe('updateMedication', () => {
	it('deletes open linked reminders when endedOn is yesterday', async () => {
		const id = await createMedication(C1, input(), U1);
		const open = await addReminder(id);
		expect(await updateMedication(C1, id, input({ endedOn: '2026-11-08' }), TODAY)).toBe(true);
		expect(await reminderIds()).not.toContain(open);
	});
	it('keeps them when endedOn is today or next week', async () => {
		const id = await createMedication(C1, input(), U1);
		const open = await addReminder(id);
		await updateMedication(C1, id, input({ endedOn: '2026-11-16' }), TODAY);
		await updateMedication(C1, id, input({ endedOn: TODAY, name: 'Renamed' }), TODAY);
		expect(await reminderIds()).toContain(open);
		expect((await getMedication(C1, id))?.name).toBe('Renamed');
	});
	it('returns false for another companion', async () => {
		const id = await createMedication(C1, input(), U1);
		expect(await updateMedication(C2, id, input({ name: 'X' }), TODAY)).toBe(false);
	});
});

describe('restartMedication', () => {
	it('clears ended_on without recreating reminders', async () => {
		const id = await createMedication(C1, input({ endedOn: '2026-11-01' }), U1);
		expect(await restartMedication(C2, id)).toBe(false);
		expect(await restartMedication(C1, id)).toBe(true);
		expect((await getMedication(C1, id))?.endedOn).toBeNull();
		expect(await reminderIds()).toEqual([]);
	});
});

describe('deleteMedication', () => {
	it('deletes open reminders, nulls completed links, cascades doses', async () => {
		const id = await createMedication(C1, input(), U1);
		const open = await addReminder(id);
		const done = await addReminder(id, true);
		await addDose(id, 1000);
		expect(await deleteMedication(C2, id)).toBe(false);
		expect(await deleteMedication(C1, id)).toBe(true);
		expect(await getMedication(C1, id)).toBeUndefined();
		expect(await reminderIds()).not.toContain(open);
		const [row] = await db.select().from(schema.reminders).where(eq(schema.reminders.id, done));
		expect(row.medicationId).toBeNull();
		expect(await db.select().from(schema.medicationDoses)).toHaveLength(0);
	});
});

describe('listMedicationSummaries', () => {
	it('computes next due, last given, schedule and active (inclusive)', async () => {
		const a = await createMedication(C1, input({ name: 'A', endedOn: TODAY }), U1);
		await createMedication(C1, input({ name: 'B', endedOn: '2026-11-08' }), U1);
		await createMedication(C2, input({ name: 'C' }), null);
		await addReminder(a, false, new Date(2000 * 1000));
		await addReminder(a, false, new Date(1000 * 1000));
		await addReminder(a, true, new Date(10 * 1000));
		await addReminder(a, false, new Date(500 * 1000)).then(async (rid) =>
			db
				.update(schema.reminders)
				.set({ isRecurring: false, recurrenceUnit: null, recurrenceAnchor: null })
				.where(eq(schema.reminders.id, rid))
		);
		await addDose(a, 100);
		await addDose(a, 300);
		await addDose(a, 200, null);

		const all = await listMedicationSummaries([C1, C2], { activeOnly: false, today: TODAY });
		expect(all.map((m) => [m.name, m.active])).toEqual([
			['A', true],
			['B', false],
			['C', true]
		]);
		const sa = all[0];
		expect(sa.nextDueAt).toEqual(new Date(500 * 1000));
		expect(sa.schedule.map((s) => s.dueAt.getTime())).toEqual([1000e3, 2000e3]);
		expect(sa.schedule[0]).toMatchObject({ unit: 'day', interval: 1, anchor: 'interval' });
		expect(sa.lastGiven).toEqual({ at: new Date(300 * 1000), by: { displayName: 'Jet' } });
		expect(all[1].lastGiven).toBeNull();
		expect(all[2]).toMatchObject({ nextDueAt: null, schedule: [], lastGiven: null });

		const active = await listMedicationSummaries([C1], { activeOnly: true, today: TODAY });
		expect(active.map((m) => m.id)).toEqual([a]);
		expect(await listMedicationSummaries([], { activeOnly: false })).toEqual([]);
	});
	it('reports a null giver when the latest dose has no user', async () => {
		const a = await createMedication(C1, input(), U1);
		await addDose(a, 100);
		await addDose(a, 200, null);
		const [s] = await listMedicationSummaries([C1], { activeOnly: true, today: TODAY });
		expect(s.lastGiven).toEqual({ at: new Date(200 * 1000), by: null });
	});
});

describe('listDoses', () => {
	it('returns newest first with giver and paging', async () => {
		const a = await createMedication(C1, input(), U1);
		await addDose(a, 100);
		await addDose(a, 300, null);
		await addDose(a, 200);
		const page = await listDoses(a);
		expect(page.map((d) => d.givenAt.getTime() / 1000)).toEqual([300, 200, 100]);
		expect(page[0].givenBy).toBeNull();
		expect(page[1]).toMatchObject({
			givenBy: { displayName: 'Jet' },
			source: 'manual',
			note: null
		});
		expect((await listDoses(a, 1, 1)).map((d) => d.givenAt.getTime() / 1000)).toEqual([200]);
	});
});

describe('sweepEndedMedicationReminders', () => {
	it('removes open reminders only for meds ended before today', async () => {
		const past = await createMedication(C1, input({ endedOn: '2026-11-08' }), U1);
		const todayMed = await createMedication(C1, input({ endedOn: TODAY }), U1);
		const active = await createMedication(C1, input(), U1);
		const pastOpen = await addReminder(past);
		const pastDone = await addReminder(past, true);
		const t = await addReminder(todayMed);
		const a = await addReminder(active);
		expect(await sweepEndedMedicationReminders(TODAY)).toBe(1);
		const left = await reminderIds();
		expect(left).not.toContain(pastOpen);
		expect(left).toEqual(expect.arrayContaining([pastDone, t, a]));
		expect(await sweepEndedMedicationReminders(TODAY)).toBe(0);
	});
});

describe('logDose', () => {
	// "Now" is 8:05 local on TODAY.
	const now = new Date(2026, 10, 9, 8, 5, 0);
	const at = (h: number, m = 0, day = 9) => new Date(2026, 10, day, h, m, 0);
	const doses = (medicationId: string) =>
		db
			.select()
			.from(schema.medicationDoses)
			.where(eq(schema.medicationDoses.medicationId, medicationId));
	const reminderRow = async (id: string) =>
		(await db.select().from(schema.reminders).where(eq(schema.reminders.id, id)))[0];

	it("skips missed occurrences from earlier days, then completes today's", async () => {
		const id = await createMedication(C1, input(), U1);
		// Daily 8:00 series, last resolved three days ago: the 6th is still open.
		const missed = await addReminder(id, false, at(8, 0, 6));
		const res = await logDose(id, { id: U1 }, { now });
		const rows = await db
			.select()
			.from(schema.reminders)
			.where(eq(schema.reminders.medicationId, id));
		const byDay = new Map(rows.map((r) => [r.dueAt.getDate(), r]));
		expect(byDay.get(6)).toMatchObject({ id: missed, outcome: 'skipped' });
		expect(byDay.get(7)?.outcome).toBe('skipped');
		expect(byDay.get(8)?.outcome).toBe('skipped');
		expect(byDay.get(9)?.outcome).toBe('completed');
		expect(res).toMatchObject({ completedReminderId: byDay.get(9)!.id });
		expect(byDay.get(10)?.completedAt).toBeNull();
		expect(rows.filter((r) => !r.completedAt && r.dueAt <= now)).toEqual([]);
		const given = await doses(id);
		expect(given).toHaveLength(1);
		expect(given[0]).toMatchObject({ source: 'reminder', reminderId: byDay.get(9)!.id });
	});

	it('defaults the occurrence dose time to now as well', async () => {
		const id = await createMedication(C1, input(), U1);
		await addReminder(id, false, at(8));
		await logDose(id, { id: U1 }, { now });
		expect((await doses(id))[0].givenAt).toEqual(now);
	});

	it('Given at 8:05 completes the 8:00 occurrence: one linked dose, nothing left overdue', async () => {
		const id = await createMedication(C1, input(), U1);
		const r8 = await addReminder(id, false, at(8));
		const r20 = await addReminder(id, false, at(20));
		const res = await logDose(id, { id: U1 }, { now });
		expect(res).toMatchObject({ completedReminderId: r8 });
		const rows = await doses(id);
		expect(rows).toHaveLength(1);
		expect(rows[0]).toMatchObject({
			id: (res as { doseId: string }).doseId,
			source: 'reminder',
			reminderId: r8,
			givenBy: U1
		});
		expect((await reminderRow(r8)).outcome).toBe('completed');
		expect((await reminderRow(r20)).completedAt).toBeNull();
		const overdue = await db
			.select()
			.from(schema.reminders)
			.where(eq(schema.reminders.medicationId, id));
		expect(overdue.filter((r) => !r.completedAt && r.dueAt <= now)).toEqual([]);
	});

	it('completes a later-today occurrence when none is overdue', async () => {
		const id = await createMedication(C1, input(), U1);
		const r20 = await addReminder(id, false, at(20));
		expect(await logDose(id, { id: U1 }, { now })).toMatchObject({ completedReminderId: r20 });
	});

	it('writes a manual dose when nothing is due today', async () => {
		const id = await createMedication(C1, input(), U1);
		const tomorrow = await addReminder(id, false, at(8, 0, 10));
		const givenAt = at(7, 30);
		const res = await logDose(id, { id: U1 }, { now, givenAt, note: 'half a pill' });
		expect(res).toMatchObject({ completedReminderId: null });
		const rows = await doses(id);
		expect(rows).toHaveLength(1);
		expect(rows[0]).toMatchObject({
			source: 'manual',
			reminderId: null,
			givenBy: U1,
			givenAt,
			note: 'half a pill'
		});
		expect((await reminderRow(tomorrow)).completedAt).toBeNull();
	});

	it('defaults givenAt to now for a manual dose', async () => {
		const id = await createMedication(C1, input(), U1);
		await logDose(id, { id: U1 }, { now });
		expect((await doses(id))[0].givenAt).toEqual(now);
	});

	it('refuses an ended medication and a missing one', async () => {
		const ended = await createMedication(C1, input({ endedOn: '2026-11-08' }), U1);
		expect(await logDose(ended, { id: U1 }, { now })).toBe('ended');
		expect(await doses(ended)).toHaveLength(0);
		expect(await logDose('nope', { id: U1 }, { now })).toBe('notFound');
		const lastDay = await createMedication(C1, input({ endedOn: TODAY }), U1);
		expect(await logDose(lastDay, { id: U1 }, { now })).toMatchObject({
			completedReminderId: null
		});
	});
});

describe('startMedicationSweep', () => {
	it('sweeps at boot and every 10 minutes, and starts only once', async () => {
		vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
		try {
			const ended = await createMedication(C1, input({ endedOn: '2000-01-01' }), U1);
			const first = await addReminder(ended);
			const stop = startMedicationSweep();
			const again = startMedicationSweep();
			await vi.waitFor(async () => expect(await reminderIds()).not.toContain(first));
			const second = await addReminder(ended);
			await vi.advanceTimersByTimeAsync(9 * 60 * 1000);
			expect(await reminderIds()).toContain(second);
			await vi.advanceTimersByTimeAsync(60 * 1000);
			await vi.waitFor(async () => expect(await reminderIds()).not.toContain(second));
			expect(vi.getTimerCount()).toBe(1);
			stop();
			again();
			expect(vi.getTimerCount()).toBe(0);
		} finally {
			vi.useRealTimers();
		}
	});
});
