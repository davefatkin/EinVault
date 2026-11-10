import { describe, it, expect, beforeAll } from 'vitest';
import { eq } from 'drizzle-orm';
import { db, schema } from '#lib/server/db/index.js';
import { localDateISO } from '#lib/date.js';
import { logDose } from './medications';
import {
	applyDoseStock,
	restoreDoseStock,
	createSupply,
	updateSupply,
	deleteSupply,
	logPurchase,
	correctCount,
	deleteSupplyEvent,
	getSupplyForCompanion,
	loadSupplyStates,
	parseSupplyForm,
	type SupplyInput
} from './supplies';

const C1 = 'c-sup-1';
const C2 = 'c-sup-2';
const U1 = 'u-sup-1';
const NOW = new Date(2026, 10, 9, 15, 30, 0);

function input(p: Partial<SupplyInput> = {}): SupplyInput {
	return {
		name: 'Carprofen',
		kind: 'counted',
		unit: 'tablets',
		startingQuantity: null,
		firstPurchaseDate: null,
		lastsDays: null,
		expiresOn: null,
		alertsEnabled: true,
		runOutLeadDays: '7',
		expiryLeadDays: '14',
		lowStockAt: null,
		notes: null,
		...p
	};
}
const durationInput = (p: Partial<SupplyInput> = {}) =>
	input({ name: 'Poop bags', kind: 'duration', unit: null, lastsDays: 30, ...p });

async function supplyRow(id: string) {
	return (await db.query.supplies.findFirst({ where: eq(schema.supplies.id, id) }))!;
}
async function eventsOf(id: string) {
	return db.select().from(schema.supplyEvents).where(eq(schema.supplyEvents.supplyId, id));
}
async function setQuantity(id: string, quantity: number) {
	await db.update(schema.supplies).set({ quantity }).where(eq(schema.supplies.id, id));
}

let n = 0;
async function med(supplyId: string | null, doseUnits = 1) {
	const id = `m-sup-${++n}`;
	await db.insert(schema.medications).values({
		id,
		companionId: C1,
		name: 'Carprofen',
		startedOn: '2026-01-01',
		supplyId,
		doseUnits
	});
	return id;
}
async function dose(medicationId: string, givenAt = NOW) {
	const id = `d-sup-${++n}`;
	await db
		.insert(schema.medicationDoses)
		.values({ id, medicationId, givenAt, givenBy: U1, source: 'manual' });
	db.transaction((tx) => applyDoseStock(tx, { id, medicationId, givenAt, givenBy: U1 }));
	return id;
}
function restore(doseIds: string[]) {
	db.transaction((tx) => restoreDoseStock(tx, doseIds));
}
function purchase(
	supplyId: string,
	p: Partial<Parameters<typeof logPurchase>[2]> = {},
	now = NOW
): string {
	return db.transaction((tx) =>
		logPurchase(
			tx,
			supplyId,
			{
				date: localDateISO(now),
				quantity: null,
				costMinor: null,
				currency: 'USD',
				expiresOn: null,
				documentId: null,
				companionId: null,
				note: null,
				...p
			},
			U1,
			now
		)
	);
}

beforeAll(async () => {
	await db.insert(schema.companions).values([
		{ id: C1, name: 'Ein' },
		{ id: C2, name: 'Edward' }
	]);
	await db
		.insert(schema.users)
		.values({ id: U1, username: 'sup1', displayName: 'Dave', role: 'member', passwordHash: 'x' });
});

describe('createSupply', () => {
	it('counted with a starting quantity writes a purchase with no cost', async () => {
		const id = await createSupply(input({ startingQuantity: 30 }), [C1, C2], U1);
		const s = await supplyRow(id);
		expect(s).toMatchObject({ kind: 'counted', quantity: 30, unit: 'tablets', createdBy: U1 });
		const ev = await eventsOf(id);
		expect(ev).toHaveLength(1);
		expect(ev[0]).toMatchObject({
			type: 'purchase',
			quantityDelta: 30,
			costMinor: null,
			currency: null,
			createdBy: U1
		});
		const links = await db
			.select()
			.from(schema.supplyCompanions)
			.where(eq(schema.supplyCompanions.supplyId, id));
		expect(links.map((l) => l.companionId).sort()).toEqual([C1, C2]);
	});

	it('counted without a starting quantity starts at 0 with no history', async () => {
		const id = await createSupply(input(), [C1], U1);
		expect((await supplyRow(id)).quantity).toBe(0);
		expect(await eventsOf(id)).toEqual([]);
	});

	it('duration with a first purchase date sets stocked_on and writes a purchase', async () => {
		const id = await createSupply(durationInput({ firstPurchaseDate: '2026-11-01' }), [C1], U1);
		const s = await supplyRow(id);
		expect(s).toMatchObject({ kind: 'duration', quantity: null, lastsDays: 30 });
		expect(s.stockedOn).toBe('2026-11-01');
		const ev = await eventsOf(id);
		expect(ev).toHaveLength(1);
		expect(ev[0]).toMatchObject({ type: 'purchase', quantityDelta: null });
		expect(localDateISO(ev[0].at)).toBe('2026-11-01');
	});
});

describe('applyDoseStock / restoreDoseStock', () => {
	it('a dose of 1 at 3 leaves 2 and one use event of -1; the version stays', async () => {
		const s = await createSupply(input({ startingQuantity: 3 }), [C1], U1);
		const version = (await supplyRow(s)).stockVersion;
		const m = await med(s);
		const d = await dose(m);
		expect((await supplyRow(s)).quantity).toBe(2);
		expect((await supplyRow(s)).stockVersion).toBe(version);
		const uses = (await eventsOf(s)).filter((e) => e.type === 'use');
		expect(uses).toHaveLength(1);
		expect(uses[0]).toMatchObject({
			quantityDelta: -1,
			doseId: d,
			companionId: C1,
			createdBy: U1,
			at: NOW
		});
	});

	it('a dose of 1 at 0.5 records -0.5, and restoring it puts back 0.5', async () => {
		const s = await createSupply(input({ startingQuantity: 1 }), [C1], U1);
		await setQuantity(s, 0.5);
		const m = await med(s);
		const d = await dose(m);
		expect((await supplyRow(s)).quantity).toBe(0);
		expect((await eventsOf(s)).find((e) => e.type === 'use')?.quantityDelta).toBe(-0.5);
		restore([d]);
		expect((await supplyRow(s)).quantity).toBe(0.5);
		expect((await eventsOf(s)).filter((e) => e.type === 'use')).toEqual([]);
	});

	it('a dose at 0 still records a use event of 0', async () => {
		const s = await createSupply(input(), [C1], U1);
		const m = await med(s);
		await dose(m);
		expect((await supplyRow(s)).quantity).toBe(0);
		const uses = (await eventsOf(s)).filter((e) => e.type === 'use');
		expect(uses).toHaveLength(1);
		expect(uses[0].quantityDelta).toBe(0);
	});

	it('uses the medication dose units', async () => {
		const s = await createSupply(input({ startingQuantity: 10 }), [C1], U1);
		const m = await med(s, 2.5);
		await dose(m);
		expect((await supplyRow(s)).quantity).toBe(7.5);
	});

	it('a medication with a duration supply or none writes nothing', async () => {
		const s = await createSupply(durationInput({ firstPurchaseDate: '2026-11-01' }), [C1], U1);
		const before = await supplyRow(s);
		await dose(await med(s));
		await dose(await med(null));
		expect(await supplyRow(s)).toEqual(before);
		expect((await eventsOf(s)).filter((e) => e.type === 'use')).toEqual([]);
	});

	it('restoring no doses, or doses without use events, is a no-op', async () => {
		const s = await createSupply(input({ startingQuantity: 5 }), [C1], U1);
		const plain = await med(null);
		const d = await dose(plain);
		restore([]);
		restore([d, 'nope']);
		expect((await supplyRow(s)).quantity).toBe(5);
	});

	it('deleting the medication keeps the count and the use event, unlinked', async () => {
		const s = await createSupply(input({ startingQuantity: 5 }), [C1], U1);
		const m = await med(s);
		await dose(m);
		await db.delete(schema.medications).where(eq(schema.medications.id, m));
		expect((await supplyRow(s)).quantity).toBe(4);
		const uses = (await eventsOf(s)).filter((e) => e.type === 'use');
		expect(uses).toHaveLength(1);
		expect(uses[0]).toMatchObject({ quantityDelta: -1, doseId: null });
	});
});

describe('logPurchase', () => {
	it('a counted purchase of 30 adds 30 and writes a new stock version', async () => {
		const s = await createSupply(input(), [C1, C2], U1);
		const version = (await supplyRow(s)).stockVersion;
		const ev = purchase(s, { quantity: 30, costMinor: 1250, companionId: C2, note: 'Chewy' });
		const row = await supplyRow(s);
		expect(row.quantity).toBe(30);
		expect(row.stockVersion).not.toBe(version);
		const [e] = (await eventsOf(s)).filter((x) => x.id === ev);
		expect(e).toMatchObject({
			type: 'purchase',
			quantityDelta: 30,
			costMinor: 1250,
			currency: 'USD',
			companionId: C2,
			note: 'Chewy',
			createdBy: U1,
			at: NOW
		});
	});

	it('a past purchase is dated local noon; a given expiry replaces the old one', async () => {
		const s = await createSupply(input({ expiresOn: '2027-01-01' }), [C1], U1);
		const ev = purchase(s, { date: '2026-11-03', quantity: 5 });
		const [e] = (await eventsOf(s)).filter((x) => x.id === ev);
		expect(e.at).toEqual(new Date(2026, 10, 3, 12, 0, 0));
		expect((await supplyRow(s)).expiresOn).toBe('2027-01-01');
		purchase(s, { quantity: 5, expiresOn: '2027-06-01' });
		expect((await supplyRow(s)).expiresOn).toBe('2027-06-01');
	});

	it('a backfilled purchase older than stocked_on leaves it', async () => {
		const s = await createSupply(durationInput({ firstPurchaseDate: '2026-11-05' }), [C1], U1);
		purchase(s, { date: '2026-11-01' });
		expect((await supplyRow(s)).stockedOn).toBe('2026-11-05');
		purchase(s, { date: '2026-11-07' });
		expect((await supplyRow(s)).stockedOn).toBe('2026-11-07');
	});
});

describe('correctCount', () => {
	it('correcting 20 to 12 records -8 and a new version', async () => {
		const s = await createSupply(input({ startingQuantity: 20 }), [C1], U1);
		const version = (await supplyRow(s)).stockVersion;
		expect(await correctCount(s, 12, U1, 'Spilled')).toBe('corrected');
		const row = await supplyRow(s);
		expect(row.quantity).toBe(12);
		expect(row.stockVersion).not.toBe(version);
		const corr = (await eventsOf(s)).filter((e) => e.type === 'correction');
		expect(corr).toHaveLength(1);
		expect(corr[0]).toMatchObject({ quantityDelta: -8, note: 'Spilled', createdBy: U1 });
	});

	it('correcting to the current value writes nothing and keeps the version', async () => {
		const s = await createSupply(input({ startingQuantity: 20 }), [C1], U1);
		const before = await supplyRow(s);
		expect(await correctCount(s, 20, U1, null)).toBe('unchanged');
		expect(await supplyRow(s)).toEqual(before);
		expect((await eventsOf(s)).filter((e) => e.type === 'correction')).toEqual([]);
	});

	it('refuses a duration supply or a missing one', async () => {
		const s = await createSupply(durationInput(), [C1], U1);
		expect(await correctCount(s, 3, U1, null)).toBe('notFound');
		expect(await correctCount('nope', 3, U1, null)).toBe('notFound');
	});
});

describe('deleteSupplyEvent', () => {
	it('deleting a purchase of 30 at 10 clamps at 0 and writes a new version', async () => {
		const s = await createSupply(input(), [C1], U1);
		const ev = purchase(s, { quantity: 30 });
		await setQuantity(s, 10);
		const version = (await supplyRow(s)).stockVersion;
		expect(await deleteSupplyEvent(s, ev)).toBe(true);
		const row = await supplyRow(s);
		expect(row.quantity).toBe(0);
		expect(row.stockVersion).not.toBe(version);
		expect(await eventsOf(s)).toEqual([]);
	});

	it('deleting a correction reverses it', async () => {
		const s = await createSupply(input({ startingQuantity: 20 }), [C1], U1);
		await correctCount(s, 12, U1, null);
		const corr = (await eventsOf(s)).find((e) => e.type === 'correction')!;
		expect(await deleteSupplyEvent(s, corr.id)).toBe(true);
		expect((await supplyRow(s)).quantity).toBe(20);
	});

	it('deleting the latest purchase of a duration supply moves stocked_on back, then clears it', async () => {
		const s = await createSupply(durationInput(), [C1], U1);
		const first = purchase(s, { date: '2026-11-01' });
		const latest = purchase(s, { date: '2026-11-05' });
		expect((await supplyRow(s)).stockedOn).toBe('2026-11-05');
		expect(await deleteSupplyEvent(s, latest)).toBe(true);
		expect((await supplyRow(s)).stockedOn).toBe('2026-11-01');
		expect(await deleteSupplyEvent(s, first)).toBe(true);
		expect((await supplyRow(s)).stockedOn).toBeNull();
	});

	it('refuses a use event and an event of another supply', async () => {
		const s = await createSupply(input({ startingQuantity: 5 }), [C1], U1);
		const other = await createSupply(input({ startingQuantity: 5 }), [C1], U1);
		await dose(await med(s));
		const use = (await eventsOf(s)).find((e) => e.type === 'use')!;
		const buy = (await eventsOf(s)).find((e) => e.type === 'purchase')!;
		const version = (await supplyRow(s)).stockVersion;
		expect(await deleteSupplyEvent(s, use.id)).toBe(false);
		expect(await deleteSupplyEvent(other, buy.id)).toBe(false);
		expect(await deleteSupplyEvent(s, 'nope')).toBe(false);
		expect((await eventsOf(s)).length).toBe(2);
		expect(await supplyRow(s)).toMatchObject({ quantity: 4, stockVersion: version });
	});
});

describe('updateSupply / deleteSupply / getSupplyForCompanion', () => {
	it('updates fields and companions but never kind or quantity', async () => {
		const s = await createSupply(input({ startingQuantity: 9 }), [C1], U1);
		const ok = await updateSupply(
			s,
			input({ name: 'Carprofen 75', startingQuantity: 50, lowStockAt: 3, notes: 'Vet refill' }),
			[C2]
		);
		expect(ok).toBe(true);
		expect(await supplyRow(s)).toMatchObject({
			name: 'Carprofen 75',
			quantity: 9,
			lowStockAt: 3,
			notes: 'Vet refill',
			kind: 'counted'
		});
		expect(await getSupplyForCompanion(C1, s)).toBeUndefined();
		expect((await getSupplyForCompanion(C2, s))?.id).toBe(s);
		expect(await updateSupply(s, durationInput(), [C2])).toBe(false);
		expect((await supplyRow(s)).kind).toBe('counted');
		expect(await updateSupply('nope', input(), [C1])).toBe(false);
	});

	it('getSupplyForCompanion is undefined unless linked', async () => {
		const s = await createSupply(input(), [C1], U1);
		expect((await getSupplyForCompanion(C1, s))?.name).toBe('Carprofen');
		expect(await getSupplyForCompanion(C2, s)).toBeUndefined();
		expect(await getSupplyForCompanion(C1, 'nope')).toBeUndefined();
	});

	it('deleting a supply unlinks its medications and Given keeps working', async () => {
		const s = await createSupply(input({ startingQuantity: 5 }), [C1], U1);
		const m = await med(s);
		expect(await deleteSupply(s)).toBe(true);
		expect(await deleteSupply(s)).toBe(false);
		const medication = await db.query.medications.findFirst({
			where: eq(schema.medications.id, m)
		});
		expect(medication?.supplyId).toBeNull();
		const res = await logDose(m, { id: U1 }, { now: NOW });
		expect(res).toMatchObject({ completedReminderId: null });
		expect(await eventsOf(s)).toEqual([]);
	});
});

describe('parseSupplyForm', () => {
	const TODAY = '2026-11-09';
	function form(o: Record<string, string | string[]>) {
		const fd = new FormData();
		for (const [k, v] of Object.entries(o)) {
			for (const one of Array.isArray(v) ? v : [v]) fd.append(k, one);
		}
		return fd;
	}
	const counted = (o: Record<string, string | string[]> = {}) =>
		form({
			name: ' Carprofen ',
			kind: 'counted',
			unit: 'tablets',
			startingQuantity: '30',
			alertsEnabled: 'on',
			runOutLeadDays: '7,3',
			expiryLeadDays: '14',
			companionIds: [C1, C2],
			...o
		});

	it('parses a counted supply', () => {
		const res = parseSupplyForm(counted({ lowStockAt: '5', expiresOn: '2027-01-01' }), TODAY);
		expect(res).toEqual({
			ok: true,
			value: {
				name: 'Carprofen',
				kind: 'counted',
				unit: 'tablets',
				startingQuantity: 30,
				firstPurchaseDate: null,
				lastsDays: null,
				expiresOn: '2027-01-01',
				alertsEnabled: true,
				runOutLeadDays: '7,3',
				expiryLeadDays: '14',
				lowStockAt: 5,
				notes: null
			},
			companionIds: [C1, C2]
		});
	});

	it('parses a duration supply; cleared leads and an unchecked toggle turn warnings off', () => {
		const res = parseSupplyForm(
			form({
				name: 'Food',
				kind: 'duration',
				lastsDays: '30',
				firstPurchaseDate: TODAY,
				runOutLeadDays: '',
				expiryLeadDays: '',
				companionIds: C1
			}),
			TODAY
		);
		expect(res).toMatchObject({
			ok: true,
			value: {
				kind: 'duration',
				unit: null,
				lastsDays: 30,
				firstPurchaseDate: TODAY,
				startingQuantity: null,
				lowStockAt: null,
				alertsEnabled: false,
				runOutLeadDays: null,
				expiryLeadDays: null
			},
			companionIds: [C1]
		});
	});

	it('accepts a comma decimal for half tablets', () => {
		const res = parseSupplyForm(counted({ startingQuantity: '12,5' }), TODAY);
		expect(res.ok && res.value.startingQuantity).toBe(12.5);
	});

	it.each([
		['no companions', counted({ companionIds: [] }), 'error.noCompanionsSelected'],
		['no name', counted({ name: '  ' }), 'error.nameRequired'],
		['a long name', counted({ name: 'x'.repeat(201) }), 'error.supplyNameTooLong'],
		['an unknown kind', counted({ kind: 'bulk' }), 'error.invalidSupplyKind'],
		['a negative quantity', counted({ startingQuantity: '-1' }), 'error.invalidQuantity'],
		['a junk low-stock count', counted({ lowStockAt: 'lots' }), 'error.invalidQuantity'],
		['a lead of 91', counted({ runOutLeadDays: '91' }), 'error.invalidLeadDays'],
		['four leads', counted({ expiryLeadDays: '1,2,3,7' }), 'error.tooManyLeadDays'],
		['a bad expiry', counted({ expiresOn: '2026-02-30' }), 'error.invalidDate'],
		[
			'lasts 0 days',
			form({ name: 'Food', kind: 'duration', lastsDays: '0', companionIds: C1 }),
			'error.invalidLastsDays'
		],
		[
			'lasts 366 days',
			form({ name: 'Food', kind: 'duration', lastsDays: '366', companionIds: C1 }),
			'error.invalidLastsDays'
		],
		[
			'a future first purchase',
			form({
				name: 'Food',
				kind: 'duration',
				lastsDays: '30',
				firstPurchaseDate: '2026-11-10',
				companionIds: C1
			}),
			'error.purchaseInFuture'
		]
	])('rejects %s', (_label, fd, error) => {
		expect(parseSupplyForm(fd, TODAY)).toEqual({ ok: false, error });
	});
});

describe('loadSupplyStates', () => {
	const TODAY = '2026-11-09';
	const C3 = 'c-sup-3';
	const C4 = 'c-sup-4';
	beforeAll(async () => {
		await db.insert(schema.companions).values([
			{ id: C3, name: 'Faye' },
			{ id: C4, name: 'Vicious', isActive: false }
		]);
	});

	async function medOn(supplyId: string, doseUnits: number, endedOn: string | null = null) {
		const id = `m-sup-${++n}`;
		await db.insert(schema.medications).values({
			id,
			companionId: C3,
			name: 'Carprofen',
			startedOn: '2026-01-01',
			endedOn,
			supplyId,
			doseUnits
		});
		return id;
	}
	async function reminder(
		medicationId: string,
		o: Partial<typeof schema.reminders.$inferInsert> = {}
	) {
		await db.insert(schema.reminders).values({
			id: `r-sup-${++n}`,
			companionId: C3,
			title: 'Dose',
			type: 'medication',
			dueAt: new Date(2026, 10, 10, 8, 0, 0),
			isRecurring: true,
			recurrenceUnit: 'day',
			recurrenceInterval: 1,
			recurrenceAnchor: 'interval',
			medicationId,
			...o
		});
	}

	it('counts each open recurring series of an active medication once', async () => {
		const s = await createSupply(input({ startingQuantity: 30 }), [C3, C2], U1);
		const daily = await medOn(s, 1);
		// Two open occurrences of one series count once.
		await reminder(daily, { seriesId: 'ser-a' });
		await reminder(daily, { seriesId: 'ser-a', dueAt: new Date(2026, 10, 11, 8, 0, 0) });
		// Completed series and one-off reminders don't count.
		await reminder(daily, { completedAt: NOW });
		await reminder(daily, {
			isRecurring: false,
			recurrenceUnit: null,
			recurrenceInterval: null,
			recurrenceAnchor: null
		});
		// 2 units once a week.
		await reminder(await medOn(s, 2), { recurrenceUnit: 'week' });
		// An ended medication doesn't count.
		await reminder(await medOn(s, 5, '2026-11-08'));

		const [state] = await loadSupplyStates({ companionId: C3, today: TODAY });
		const days = Math.floor(30 / (1 + 2 / 7));
		expect(state).toMatchObject({
			id: s,
			quantity: 30,
			daysLeft: days,
			runOutOn: `2026-12-${String(9 + days - 30).padStart(2, '0')}`,
			runOutLeads: [7],
			expiryLeads: [14],
			runningLow: false,
			expiring: false,
			stockVersion: (await supplyRow(s)).stockVersion,
			runOutAlerted: null,
			lowAlerted: null,
			expiryAlerted: null
		});
		// Every linked pet, by name, even when filtered to one.
		expect(state.companions).toEqual([
			{ id: C2, name: 'Edward', isActive: true },
			{ id: C3, name: 'Faye', isActive: true }
		]);
	});

	it('projects a duration supply and flags attention', async () => {
		const s = await createSupply(
			durationInput({ firstPurchaseDate: '2026-10-15', lastsDays: 30, expiresOn: '2026-11-20' }),
			[C3],
			U1
		);
		const state = (await loadSupplyStates({ companionId: C3, today: TODAY })).find(
			(x) => x.id === s
		);
		expect(state).toMatchObject({
			runOutOn: '2026-11-14',
			daysLeft: 5,
			runningLow: true,
			expiring: true
		});
	});

	it('a far-off run-out loads capped instead of throwing', async () => {
		// Written past the input caps, as an older row or a direct edit could be.
		const huge = await createSupply(input({ name: 'Huge' }), [C3], U1);
		await setQuantity(huge, 3_000_000);
		await reminder(await medOn(huge, 1));
		const tiny = await createSupply(input({ name: 'Tiny', startingQuantity: 300 }), [C3], U1);
		await reminder(await medOn(tiny, 0.0001));
		const states = await loadSupplyStates({ companionId: C3, today: TODAY });
		for (const id of [huge, tiny]) {
			expect(states.find((x) => x.id === id)).toMatchObject({
				daysLeft: 3650,
				runOutOn: '2036-11-06'
			});
		}
	});

	it('filters by companion, warnings and active pets', async () => {
		const on = await createSupply(input({ name: 'On' }), [C3], U1);
		const off = await createSupply(input({ name: 'Off', alertsEnabled: false }), [C3], U1);
		const archived = await createSupply(input({ name: 'Archived' }), [C4], U1);
		const ids = async (o: Partial<Parameters<typeof loadSupplyStates>[0]>) =>
			(await loadSupplyStates({ today: TODAY, ...o })).map((x) => x.id);

		expect(await ids({})).toEqual(expect.arrayContaining([on, off, archived]));
		expect(await ids({ companionId: C3 })).toEqual(expect.arrayContaining([on, off]));
		expect(await ids({ companionId: C3 })).not.toContain(archived);
		expect(await ids({ alertsOnly: true })).not.toContain(off);
		expect(await ids({ activeOnly: true })).not.toContain(archived);
		expect(await ids({ activeOnly: true })).toContain(on);
	});
});
