import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest';
import { eq, sql } from 'drizzle-orm';
import { db, schema } from '#lib/server/db/index.js';
import { createSupply, type SupplyInput } from './supplies';
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
	deleteDose,
	sweepEndedMedicationReminders,
	logDose,
	formatMedicationScheduleLine,
	medicationScheduleMarkdown,
	startMedicationSweep,
	type MedicationInput
} from './medications';
import { medicationActiveSql } from './medication-sql';

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
		supplyId: null,
		doseUnits: 1,
		...p
	};
}

let n = 0;
async function addReminder(
	medicationId: string | null,
	completed = false,
	dueAt = new Date(1e12),
	recurrenceUnit: 'day' | 'month' = 'day'
) {
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
		recurrenceUnit,
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
			value: {
				name: 'Pill',
				dose: '1',
				instructions: null,
				startedOn: '2026-11-01',
				endedOn: null,
				supplyId: null,
				doseUnits: 1
			}
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

describe('parseMedicationForm supply link', () => {
	const form = (o: Record<string, string>) => {
		const f = new FormData();
		for (const [k, v] of Object.entries({ name: 'Pill', startedOn: '2026-11-01', ...o }))
			f.set(k, v);
		return f;
	};
	const supply = (p: Partial<SupplyInput>, companions: string[]) =>
		createSupply(
			{
				name: 'Tablets',
				kind: 'counted',
				unit: 'tablets',
				startingQuantity: 10,
				firstPurchaseDate: null,
				lastsDays: null,
				expiresOn: null,
				alertsEnabled: true,
				runOutLeadDays: '7',
				expiryLeadDays: '14',
				lowStockAt: null,
				notes: null,
				...p
			},
			companions,
			U1
		);

	it('accepts a counted supply of this pet and half units', async () => {
		const id = await supply({}, [C1]);
		const r = parseMedicationForm(form({ supplyId: id, doseUnits: '0.5' }), 'en', TODAY, C1);
		expect(r).toMatchObject({ ok: true, value: { supplyId: id, doseUnits: 0.5 } });
		// A comma is a decimal separator too.
		expect(
			parseMedicationForm(form({ supplyId: id, doseUnits: '1,5' }), 'en', TODAY, C1)
		).toMatchObject({ ok: true, value: { doseUnits: 1.5 } });
	});
	it('defaults to 1 unit and ignores units without a supply', () => {
		expect(parseMedicationForm(form({ doseUnits: '3' }), 'en', TODAY, C1)).toMatchObject({
			ok: true,
			value: { supplyId: null, doseUnits: 1 }
		});
	});
	it("rejects a duration supply, another pet's supply and an unknown one", async () => {
		const duration = await supply(
			{ kind: 'duration', unit: null, startingQuantity: null, lastsDays: 30 },
			[C1]
		);
		const other = await supply({}, [C2]);
		for (const supplyId of [duration, other, 'nope']) {
			expect(parseMedicationForm(form({ supplyId }), 'en', TODAY, C1)).toEqual({
				ok: false,
				message: 'Supply not found.'
			});
		}
		// Without a pet to check against, nothing can be linked.
		const mine = await supply({}, [C1]);
		expect(parseMedicationForm(form({ supplyId: mine }), 'en', TODAY).ok).toBe(false);
	});
	it('rejects units of 0, negative, junk and above 1000', async () => {
		const id = await supply({}, [C1]);
		for (const doseUnits of ['0', '-1', 'abc', '1001', 'Infinity'])
			expect(parseMedicationForm(form({ supplyId: id, doseUnits }), 'en', TODAY, C1).ok).toBe(
				false
			);
		expect(parseMedicationForm(form({ supplyId: id, doseUnits: '1000' }), 'en', TODAY, C1).ok).toBe(
			true
		);
	});
});

describe('listMedicationSummaries supply', () => {
	it('carries the supply only when asked, and the default dose size otherwise', async () => {
		const sid = await createSupply(
			{
				name: 'Tablets',
				kind: 'counted',
				unit: 'tablets',
				startingQuantity: 10,
				firstPurchaseDate: null,
				lastsDays: null,
				expiresOn: null,
				alertsEnabled: true,
				runOutLeadDays: '7',
				expiryLeadDays: '14',
				lowStockAt: null,
				notes: null
			},
			[C1],
			U1
		);
		await createMedication(C1, input({ supplyId: sid, doseUnits: 2 }), U1);
		const [owner] = await listMedicationSummaries([C1], { activeOnly: false, includeSupply: true });
		expect(owner.supply).toMatchObject({ id: sid, name: 'Tablets', quantity: 10, unit: 'tablets' });
		expect(owner.doseUnits).toBe(2);
		const [plain] = await listMedicationSummaries([C1], { activeOnly: false });
		expect(plain.supply).toBeNull();
		expect(plain.doseUnits).toBe(1);
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
		expect(await endMedication(C2, id, TODAY)).toBe('notFound');
		expect(await reminderIds()).toContain(open);
	});
	it('ends a course early, but leaves an ended medication alone', async () => {
		const course = await createMedication(C1, input({ endedOn: '2026-11-16' }), U1);
		expect(await endMedication(C1, course, TODAY)).toBe(true);
		expect((await getMedication(C1, course))?.endedOn).toBe(TODAY);
		const old = await createMedication(C1, input({ endedOn: '2026-11-05' }), U1);
		expect(await endMedication(C1, old, TODAY)).toBe('ended');
		expect((await getMedication(C1, old))?.endedOn).toBe('2026-11-05');
	});
	it("refuses a medication that hasn't started yet", async () => {
		const id = await createMedication(C1, input({ startedOn: '2026-11-10' }), U1);
		const open = await addReminder(id);
		expect(await endMedication(C1, id, TODAY)).toBe('notStarted');
		expect((await getMedication(C1, id))?.endedOn).toBeNull();
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
	it('deletes open occurrences due after a new end date, keeping earlier ones', async () => {
		const id = await createMedication(C1, input(), U1);
		const tomorrow = await addReminder(id, false, new Date(2026, 10, 10, 8));
		const lastDay = await addReminder(id, false, new Date(2026, 10, 15, 23, 30));
		const after = await addReminder(id, false, new Date(2026, 10, 16, 0, 30));
		const done = await addReminder(id, true, new Date(2026, 10, 20, 8));
		expect(await updateMedication(C1, id, input({ endedOn: '2026-11-15' }), TODAY)).toBe(true);
		const left = await reminderIds();
		expect(left).toEqual(expect.arrayContaining([tomorrow, lastDay, done]));
		expect(left).not.toContain(after);
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

describe('deleteDose', () => {
	it('removes only that dose; its reminder stays completed', async () => {
		const id = await createMedication(C1, input(), U1);
		const done = await addReminder(id, true);
		const linked = await addDose(id, 100);
		await db
			.update(schema.medicationDoses)
			.set({ reminderId: done, source: 'reminder' })
			.where(eq(schema.medicationDoses.id, linked));
		const kept = await addDose(id, 200);
		expect(await deleteDose(C1, id, linked)).toBe(true);
		expect((await listDoses(id)).map((d) => d.id)).toEqual([kept]);
		const [reminder] = await db
			.select()
			.from(schema.reminders)
			.where(eq(schema.reminders.id, done));
		expect(reminder).toMatchObject({ outcome: 'completed' });
		expect(reminder.completedAt).not.toBeNull();
	});
	it("refuses another companion's or another medication's dose", async () => {
		const id = await createMedication(C1, input(), U1);
		const otherMed = await createMedication(C1, input({ name: 'Other' }), U1);
		const dose = await addDose(id, 100);
		expect(await deleteDose(C2, id, dose)).toBe(false);
		expect(await deleteDose(C1, otherMed, dose)).toBe(false);
		expect(await deleteDose(C1, id, 'nope')).toBe(false);
		expect((await listDoses(id)).map((d) => d.id)).toEqual([dose]);
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
	it('copes with more ended medications than SQLite takes as bound parameters', async () => {
		db.run(sql`
			with recursive n(i) as (select 1 union all select i + 1 from n where i < 40000)
			insert into medications (id, companion_id, name, started_on, ended_on)
			select 'bulk-' || i, ${C1}, 'Old', '2026-01-01', '2026-02-01' from n`);
		const last = await addReminder('bulk-40000');
		expect(await sweepEndedMedicationReminders(TODAY)).toBe(1);
		expect(await reminderIds()).not.toContain(last);
	});
});

describe('medicationActiveSql', () => {
	it('matches no end date and end dates on or after today', async () => {
		await createMedication(C1, input({ name: 'open' }), U1);
		await createMedication(C1, input({ name: 'today', endedOn: TODAY }), U1);
		await createMedication(C1, input({ name: 'later', endedOn: '2026-11-10' }), U1);
		await createMedication(C1, input({ name: 'past', endedOn: '2026-11-08' }), U1);
		const rows = await db
			.select({ name: schema.medications.name })
			.from(schema.medications)
			.where(medicationActiveSql(TODAY));
		expect(rows.map((r) => r.name).sort()).toEqual(['later', 'open', 'today']);
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

	it('leaves an occurrence more than 3 hours away alone and writes a manual dose', async () => {
		const id = await createMedication(C1, input(), U1);
		const r20 = await addReminder(id, false, at(20));
		expect(await logDose(id, { id: U1 }, { now })).toMatchObject({ completedReminderId: null });
		expect((await reminderRow(r20)).completedAt).toBeNull();
		expect((await doses(id))[0]).toMatchObject({ source: 'manual' });
	});

	it('Given at 19:00 completes the 20:00 occurrence (within 3 hours)', async () => {
		const id = await createMedication(C1, input(), U1);
		const r20 = await addReminder(id, false, at(20));
		expect(await logDose(id, { id: U1 }, { now: at(19) })).toMatchObject({
			completedReminderId: r20
		});
	});

	it("a late-evening Given never reaches tomorrow's early occurrence", async () => {
		const id = await createMedication(C1, input(), U1);
		const early = await addReminder(id, false, at(0, 30, 10));
		expect(await logDose(id, { id: U1 }, { now: at(22) })).toMatchObject({
			completedReminderId: null
		});
		expect((await reminderRow(early)).completedAt).toBeNull();
	});

	it('twice daily: a second tap after 8:00 is a manual dose and 20:00 stays open', async () => {
		const id = await createMedication(C1, input(), U1);
		const r8 = await addReminder(id, false, at(8));
		const r20 = await addReminder(id, false, at(20));
		expect(await logDose(id, { id: U1 }, { now })).toMatchObject({ completedReminderId: r8 });
		expect(await logDose(id, { id: U1 }, { now: at(8, 10) })).toMatchObject({
			completedReminderId: null
		});
		expect((await reminderRow(r20)).completedAt).toBeNull();
		const rows = await doses(id);
		expect(rows.map((d) => d.source).sort()).toEqual(['manual', 'reminder']);
	});

	it('a late monthly dose completes the missed occurrence and the next month spawns', async () => {
		const id = await createMedication(C1, input(), U1);
		const nov1 = await addReminder(id, false, at(9, 0, 1), 'month');
		const res = await logDose(id, { id: U1 }, { now });
		expect(res).toMatchObject({ completedReminderId: nov1 });
		expect((await reminderRow(nov1)).outcome).toBe('completed');
		const open = (
			await db.select().from(schema.reminders).where(eq(schema.reminders.medicationId, id))
		).filter((r) => !r.completedAt);
		expect(open.map((r) => [r.dueAt.getMonth(), r.dueAt.getDate()])).toEqual([[11, 1]]);
		expect((await doses(id))[0]).toMatchObject({ source: 'reminder', reminderId: nov1 });
	});

	it("a backdated dose never completes a later day's occurrence", async () => {
		const id = await createMedication(C1, input(), U1);
		await addReminder(id, true, at(8, 0, 8));
		const today8 = await addReminder(id, false, at(8));
		const givenAt = at(8, 0, 8);
		const res = await logDose(id, { id: U1 }, { now, givenAt });
		expect(res).toMatchObject({ completedReminderId: null });
		expect((await reminderRow(today8)).completedAt).toBeNull();
		expect((await doses(id))[0]).toMatchObject({ source: 'manual', givenAt });
	});

	it("counts a givenAt a few minutes ahead as now, so a fast clock near midnight still completes today's dose", async () => {
		const id = await createMedication(C1, input(), U1);
		const r20 = await addReminder(id, false, at(20));
		const late = at(23, 58);
		const res = await logDose(id, { id: U1 }, { now: late, givenAt: at(0, 1, 10) });
		expect(res).toMatchObject({ completedReminderId: r20 });
		expect((await reminderRow(r20)).completedAt).not.toBeNull();
		expect((await doses(id))[0]).toMatchObject({ source: 'reminder', givenAt: late });
	});

	it('refuses a givenAt more than 5 minutes in the future', async () => {
		const id = await createMedication(C1, input(), U1);
		const r8 = await addReminder(id, false, at(8));
		expect(await logDose(id, { id: U1 }, { now, givenAt: at(8, 11) })).toBe('future');
		expect((await reminderRow(r8)).completedAt).toBeNull();
		expect(await doses(id)).toHaveLength(0);
	});

	it('refuses a dose given before the medication started', async () => {
		const id = await createMedication(C1, input({ startedOn: TODAY }), U1);
		const r8 = await addReminder(id, false, at(8));
		expect(await logDose(id, { id: U1 }, { now, givenAt: at(8, 0, 8) })).toBe('beforeStart');
		const future = await createMedication(C1, input({ startedOn: '2026-11-10' }), U1);
		expect(await logDose(future, { id: U1 }, { now })).toBe('beforeStart');
		expect(await doses(id)).toHaveLength(0);
		expect(await doses(future)).toHaveLength(0);
		expect((await reminderRow(r8)).completedAt).toBeNull();
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

describe('medicationScheduleMarkdown (deprecated API alias)', () => {
	it('formats name, dose and instructions, omitting missing parts', () => {
		const f = formatMedicationScheduleLine;
		expect(f({ name: 'Carprofen', dose: '1 tablet', instructions: 'with food' })).toBe(
			'- Carprofen, 1 tablet: with food'
		);
		expect(f({ name: 'Carprofen', dose: '1 tablet', instructions: null })).toBe(
			'- Carprofen, 1 tablet'
		);
		expect(f({ name: 'Carprofen', dose: null, instructions: 'with food' })).toBe(
			'- Carprofen: with food'
		);
		expect(f({ name: 'Carprofen', dose: null, instructions: null })).toBe('- Carprofen');
		expect(f({ name: 'Pill', dose: null, instructions: 'a\n\nb' })).toBe('- Pill: a b');
	});

	it('groups active medications per companion in one map; none means no entry', async () => {
		await createMedication(
			C1,
			input({ name: 'Carprofen', dose: '1 tablet', instructions: 'with food' }),
			U1
		);
		await createMedication(C1, input({ name: 'Antibiotic', dose: '2 ml' }), U1);
		await createMedication(C1, input({ name: 'Old', endedOn: '2026-11-01' }), U1);
		const map = await medicationScheduleMarkdown([C1, C2], TODAY);
		expect(map.get(C1)).toBe('- Antibiotic, 2 ml\n- Carprofen, 1 tablet: with food');
		expect(map.has(C2)).toBe(false);
	});
});

describe('supply stock', () => {
	const now = new Date(2026, 10, 9, 8, 5, 0);
	let k = 0;
	async function linkSupply(medicationId: string, quantity: number) {
		const supplyId = `sup-med-${++k}`;
		await db
			.insert(schema.supplies)
			.values({ id: supplyId, name: 'Carprofen', kind: 'counted', quantity });
		await db
			.update(schema.medications)
			.set({ supplyId })
			.where(eq(schema.medications.id, medicationId));
		return supplyId;
	}
	const stock = async (supplyId: string) =>
		(await db.query.supplies.findFirst({ where: eq(schema.supplies.id, supplyId) }))!.quantity;
	const usesOf = (supplyId: string) =>
		db.query.supplyEvents.findMany({ where: eq(schema.supplyEvents.supplyId, supplyId) });

	it('a manual dose subtracts once', async () => {
		const id = await createMedication(C1, input(), U1);
		const s = await linkSupply(id, 3);
		const res = (await logDose(id, { id: U1 }, { now })) as { doseId: string };
		expect(await stock(s)).toBe(2);
		const uses = await usesOf(s);
		expect(uses).toHaveLength(1);
		expect(uses[0]).toMatchObject({ quantityDelta: -1, doseId: res.doseId, at: now });
	});

	it('a dose that completes a reminder subtracts once', async () => {
		const id = await createMedication(C1, input(), U1);
		const s = await linkSupply(id, 3);
		await addReminder(id, false, new Date(2026, 10, 9, 8, 0, 0));
		const res = await logDose(id, { id: U1 }, { now });
		expect(res).toMatchObject({ completedReminderId: expect.any(String) });
		expect(await stock(s)).toBe(2);
		expect(await usesOf(s)).toHaveLength(1);
	});

	it('removing a dose taken at 0.5 left puts back 0.5, not 1', async () => {
		const id = await createMedication(C1, input(), U1);
		const s = await linkSupply(id, 0.5);
		const res = (await logDose(id, { id: U1 }, { now })) as { doseId: string };
		expect(await stock(s)).toBe(0);
		expect((await usesOf(s))[0].quantityDelta).toBe(-0.5);
		expect(await deleteDose(C1, id, res.doseId)).toBe(true);
		expect(await stock(s)).toBe(0.5);
		expect(await usesOf(s)).toEqual([]);
	});

	it('a refused dose delete leaves the stock alone', async () => {
		const id = await createMedication(C1, input(), U1);
		const s = await linkSupply(id, 3);
		const res = (await logDose(id, { id: U1 }, { now })) as { doseId: string };
		expect(await deleteDose(C2, id, res.doseId)).toBe(false);
		expect(await stock(s)).toBe(2);
		expect(await usesOf(s)).toHaveLength(1);
	});
});
