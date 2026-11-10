import { describe, it, expect, beforeAll } from 'vitest';
import { eq } from 'drizzle-orm';
import { db, schema } from '#lib/server/db/index.js';
import { localDateISO } from '#lib/date.js';
import { createSupply, type SupplyInput } from './supplies';
import { supplyOwnerOnly } from './supply-actions';
import { actions as newActions } from '../../routes/(app)/(companion)/[companionId]/supplies/new/+page.server';
import { actions as detailActions } from '../../routes/(app)/(companion)/[companionId]/supplies/[id]/+page.server';
import { actions as editActions } from '../../routes/(app)/(companion)/[companionId]/supplies/[id]/edit/+page.server';

const EIN = 'sa-ein';
const ED = 'sa-ed';
const OTHER = 'sa-other';
const GONE = 'sa-gone';
const USER = 'sa-user';

function form(fields: Record<string, string | string[]>) {
	const fd = new FormData();
	for (const [k, v] of Object.entries(fields)) {
		for (const item of Array.isArray(v) ? v : [v]) fd.append(k, item);
	}
	return fd;
}

type Result = { status?: number; location?: string; data?: { error?: string; values?: unknown } };
type Action = (e: never) => Promise<unknown>;

/** Runs an action; a redirect comes back as { status, location } instead of throwing. */
async function call(
	action: unknown,
	fields: Record<string, string | string[]>,
	opts: { role?: string; id?: string; companionId?: string } = {}
): Promise<Result> {
	const event = {
		request: { formData: async () => form(fields) },
		params: { companionId: opts.companionId ?? EIN, id: opts.id ?? '' },
		locals: { user: { id: USER, role: opts.role ?? 'member' }, locale: 'en' }
	};
	try {
		return ((await (action as Action)(event as never)) ?? {}) as Result;
	} catch (e) {
		const r = e as { status?: number; location?: string };
		if (r && typeof r.status === 'number' && r.location) return r;
		throw e;
	}
}

function input(p: Partial<SupplyInput> = {}): SupplyInput {
	return {
		name: 'Carprofen',
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
	};
}

const supplyRow = async (id: string) =>
	db.query.supplies.findFirst({ where: eq(schema.supplies.id, id) });
const purchases = (id: string) =>
	db.query.supplyEvents.findMany({ where: eq(schema.supplyEvents.supplyId, id) });
const linksOf = async (id: string) =>
	(
		await db.query.supplyCompanions.findMany({ where: eq(schema.supplyCompanions.supplyId, id) })
	).map((l) => l.companionId);

const counted = {
	name: 'Flea tablets',
	kind: 'counted',
	unit: 'tablets',
	startingQuantity: '6',
	runOutLeadDays: '7',
	expiryLeadDays: '14',
	alertsEnabled: 'on'
};

describe('supply actions', () => {
	beforeAll(async () => {
		await db.insert(schema.users).values({
			id: USER,
			username: USER,
			displayName: 'SA',
			role: 'member'
		} as typeof schema.users.$inferInsert);
		await db.insert(schema.companions).values([
			{ id: EIN, name: 'Ein' },
			{ id: ED, name: 'Edward' },
			{ id: OTHER, name: 'Other' },
			{ id: GONE, name: 'Gone', isActive: false }
		] as (typeof schema.companions.$inferInsert)[]);
	});

	it('supplyOwnerOnly refuses caretakers, archived pets and supplies of another pet', async () => {
		const mine = await createSupply(input(), [EIN], USER);
		const theirs = await createSupply(input(), [OTHER], USER);
		const archived = await createSupply(input(), [GONE], USER);
		const locals = (role = 'member') => ({ user: { id: USER, role }, locale: 'en' }) as never;
		expect(await supplyOwnerOnly(locals(), EIN, mine)).toBeNull();
		expect((await supplyOwnerOnly(locals('caretaker'), EIN, mine))?.status).toBe(403);
		expect((await supplyOwnerOnly(locals(), EIN, theirs))?.status).toBe(404);
		expect((await supplyOwnerOnly(locals(), GONE, archived))?.status).toBe(403);
	});

	it('purchase adds to the count and stores the cost in minor units', async () => {
		const id = await createSupply(input(), [EIN], USER);
		const res = await call(
			detailActions.purchase,
			{ date: localDateISO(), quantity: '5', cost: '12.50', note: 'vet' },
			{ id }
		);
		expect(res.status).toBeUndefined();
		expect((await supplyRow(id))?.quantity).toBe(15);
		const bought = (await purchases(id)).find((e) => e.costMinor !== null);
		expect(bought).toMatchObject({ costMinor: 1250, currency: 'USD', note: 'vet' });
	});

	it('purchase refuses a receipt pet the supply is not linked to', async () => {
		const id = await createSupply(input(), [EIN], USER);
		const res = await call(
			detailActions.purchase,
			{ date: localDateISO(), quantity: '5', receiptCompanionId: OTHER },
			{ id }
		);
		expect(res.status).toBe(400);
		expect((await supplyRow(id))?.quantity).toBe(10);
	});

	it('purchase refuses a future date, a quantity of 0 and a bad cost', async () => {
		const id = await createSupply(input(), [EIN], USER);
		const tomorrow = new Date();
		tomorrow.setDate(tomorrow.getDate() + 1);
		const cases: Record<string, string>[] = [
			{ date: localDateISO(tomorrow), quantity: '5' },
			{ date: localDateISO(), quantity: '0' },
			{ date: localDateISO(), quantity: '5', cost: '-1' },
			{ date: localDateISO(), quantity: '5', cost: '1.234' },
			{ date: localDateISO(), quantity: '100001' },
			{ date: localDateISO(), quantity: '1e2' }
		];
		for (const fields of cases) {
			expect((await call(detailActions.purchase, fields, { id })).status).toBe(400);
		}
		expect((await supplyRow(id))?.quantity).toBe(10);
	});

	it('every detail action refuses caretakers, archived pets and another pet’s supply', async () => {
		const mine = await createSupply(input(), [EIN], USER);
		const theirs = await createSupply(input(), [OTHER], USER);
		const archived = await createSupply(input(), [GONE], USER);
		const fields = { date: localDateISO(), quantity: '1', actual: '3', eventId: 'x' };
		for (const name of ['purchase', 'correct', 'deleteEvent', 'delete'] as const) {
			const action = detailActions[name];
			expect((await call(action, fields, { id: mine, role: 'caretaker' })).status).toBe(403);
			expect((await call(action, fields, { id: theirs })).status).toBe(404);
			expect((await call(action, fields, { id: archived, companionId: GONE })).status).toBe(403);
		}
		expect((await call(editActions.update, counted, { id: theirs })).status).toBe(404);
		expect((await call(newActions.create, counted, { role: 'caretaker' })).status).toBe(403);
		expect((await call(newActions.create, counted, { companionId: GONE })).status).toBe(403);
		for (const id of [mine, theirs, archived]) expect((await supplyRow(id))?.quantity).toBe(10);
	});

	it('correct sets the count, and the same count changes nothing', async () => {
		const id = await createSupply(input(), [EIN], USER);
		expect((await call(detailActions.correct, { actual: '7' }, { id })).status).toBeUndefined();
		const after = await supplyRow(id);
		expect(after?.quantity).toBe(7);
		expect((await call(detailActions.correct, { actual: '7' }, { id })).status).toBeUndefined();
		expect((await supplyRow(id))?.stockVersion).toBe(after?.stockVersion);
		expect((await call(detailActions.correct, { actual: '-1' }, { id })).status).toBe(400);
		expect((await call(detailActions.correct, { actual: 'abc' }, { id })).status).toBe(400);
		const over = await call(detailActions.correct, { actual: '100001' }, { id });
		expect(over).toMatchObject({ status: 400, data: { error: 'Enter a number up to 100000.' } });
		expect((await supplyRow(id))?.quantity).toBe(7);
	});

	it('deleteEvent reverses a purchase; delete removes the supply', async () => {
		const id = await createSupply(input(), [EIN], USER);
		const [start] = await purchases(id);
		expect((await call(detailActions.deleteEvent, { eventId: start.id }, { id })).status).toBe(
			undefined
		);
		expect((await supplyRow(id))?.quantity).toBe(0);
		expect((await call(detailActions.deleteEvent, { eventId: start.id }, { id })).status).toBe(404);
		const res = await call(detailActions.delete, {}, { id });
		expect(res).toMatchObject({ status: 303, location: `/${EIN}/supplies` });
		expect(await supplyRow(id)).toBeUndefined();
	});

	it('create links the chosen pets and refuses unknown or archived ones', async () => {
		const res = await call(newActions.create, { ...counted, companionIds: [EIN, ED] });
		expect(res.status).toBe(303);
		const id = res.location!.split('/').pop()!;
		expect(res.location).toBe(`/${EIN}/supplies/${id}`);
		expect((await linksOf(id)).sort()).toEqual([ED, EIN].sort());
		expect((await supplyRow(id))?.quantity).toBe(6);

		for (const companionIds of [[EIN, 'nope'], [EIN, GONE], []]) {
			const bad = await call(newActions.create, { ...counted, name: 'sa-bad', companionIds });
			expect(bad.status).toBe(400);
			expect(bad.data?.values).toMatchObject({ name: 'sa-bad' });
		}
		const made = await db.query.supplies.findMany({ where: eq(schema.supplies.name, 'sa-bad') });
		expect(made).toHaveLength(0);
	});

	it('update keeps an archived pet that was already linked, and moves to a linked pet', async () => {
		const id = await createSupply(input(), [EIN, GONE], USER);
		const fields = { ...counted, name: 'Renamed', companionIds: [EIN, GONE] };
		expect((await call(editActions.update, fields, { id })).location).toBe(
			`/${EIN}/supplies/${id}`
		);
		expect((await linksOf(id)).sort()).toEqual([EIN, GONE].sort());
		expect((await supplyRow(id))?.name).toBe('Renamed');

		// Unchecking the route's own pet saves and lands under the remaining one.
		const moved = await call(editActions.update, { ...fields, companionIds: [ED] }, { id });
		expect(moved).toMatchObject({ status: 303, location: `/${ED}/supplies/${id}` });

		// An archived pet that isn't linked can't be added, and one pet must be active.
		const other = await createSupply(input(), [EIN], USER);
		for (const companionIds of [[EIN, GONE], [GONE]]) {
			const res = await call(editActions.update, { ...counted, companionIds }, { id: other });
			expect(res.status).toBe(400);
		}
		expect(await linksOf(other)).toEqual([EIN]);
	});

	it('update keeps the kind and refuses a different one', async () => {
		const id = await createSupply(input(), [EIN], USER);
		const res = await call(
			editActions.update,
			{ ...counted, kind: 'duration', lastsDays: '30', companionIds: [EIN] },
			{ id }
		);
		expect(res.status).toBe(400);
		expect((await supplyRow(id))?.kind).toBe('counted');
	});
});
