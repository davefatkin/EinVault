import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from 'vitest';
import { eq } from 'drizzle-orm';
import { db, schema } from '#lib/server/db/index.js';
import { load, actions } from './+page.server';

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

// Caretaker "Given" (#279): the route guard only checks the role, so the
// action does its own assignment, shift, active companion and ownership checks.
describe('given action', () => {
	const user = 'cpg-caretaker';
	const comp = 'cpg-comp';
	const otherComp = 'cpg-other';
	const archived = 'cpg-archived';
	const unassigned = 'cpg-unassigned';

	beforeAll(async () => {
		await db.insert(schema.users).values({
			id: user,
			username: user,
			displayName: 'Faye',
			role: 'caretaker'
		} as typeof schema.users.$inferInsert);
		await db.insert(schema.companions).values([
			{ id: comp, name: 'Given Dog' },
			{ id: otherComp, name: 'Other Dog' },
			{ id: archived, name: 'Archived Dog', isActive: false },
			{ id: unassigned, name: 'Unassigned Dog' }
		] as (typeof schema.companions.$inferInsert)[]);
		await db.insert(schema.companionCaretakers).values(
			[comp, otherComp, archived].map((companionId) => ({
				userId: user,
				companionId
			})) as (typeof schema.companionCaretakers.$inferInsert)[]
		);
	});

	afterEach(async () => {
		await db.delete(schema.caretakerShifts).where(eq(schema.caretakerShifts.userId, user));
	});

	async function onShift() {
		await db.insert(schema.caretakerShifts).values({
			id: `cpg-shift-${Math.random().toString(36).slice(2)}`,
			userId: user,
			startAt: new Date(Date.now() - 3600_000),
			endAt: new Date(Date.now() + 3600_000)
		} as typeof schema.caretakerShifts.$inferInsert);
	}
	async function med(companionId: string, endedOn: string | null = null) {
		const id = `cpg-med-${Math.random().toString(36).slice(2)}`;
		await db
			.insert(schema.medications)
			.values({ id, companionId, name: 'Carprofen', startedOn: '2026-01-01', endedOn });
		return id;
	}
	const doses = (m: string) =>
		db.query.medicationDoses.findMany({ where: eq(schema.medicationDoses.medicationId, m) });
	function give(companionId: string, id: string, userId = user) {
		const fd = new FormData();
		fd.set('id', id);
		return (
			actions.given as unknown as (e: never) => Promise<{
				status?: number;
				data?: unknown;
				doseLogged?: string;
			}>
		)({
			request: { formData: async () => fd },
			params: { companionId },
			locals: { user: { id: userId, role: 'caretaker' }, locale: 'en' }
		} as never);
	}

	it('logs a dose credited to the caretaker when on shift', async () => {
		await onShift();
		const m = await med(comp);
		expect(await give(comp, m)).toEqual({ doseLogged: 'Carprofen' });
		const rows = await doses(m);
		expect(rows).toHaveLength(1);
		expect(rows[0].givenBy).toBe(user);
	});

	it('refuses off shift', async () => {
		const m = await med(comp);
		expect((await give(comp, m)).status).toBe(403);
		expect(await doses(m)).toHaveLength(0);
	});

	it('refuses a companion the caretaker is not assigned to', async () => {
		await onShift();
		const m = await med(unassigned);
		expect((await give(unassigned, m)).status).toBe(403);
		expect(await doses(m)).toHaveLength(0);
	});

	it("refuses another companion's medication, even an assigned one", async () => {
		await onShift();
		const m = await med(otherComp);
		expect((await give(comp, m)).status).toBe(404);
		expect(await doses(m)).toHaveLength(0);
	});

	it('refuses an ended medication', async () => {
		await onShift();
		const m = await med(comp, '2020-01-01');
		expect((await give(comp, m)).status).toBe(400);
		expect(await doses(m)).toHaveLength(0);
	});

	it('refuses an archived companion', async () => {
		await onShift();
		const m = await med(archived);
		expect((await give(archived, m)).status).toBe(404);
		expect(await doses(m)).toHaveLength(0);
	});

	it('refuses a missing medication id', async () => {
		await onShift();
		expect((await give(comp, 'nope')).status).toBe(404);
	});
});
