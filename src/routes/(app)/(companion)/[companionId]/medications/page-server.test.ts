import { describe, it, expect, beforeAll } from 'vitest';
import { eq } from 'drizzle-orm';
import { db, schema } from '#lib/server/db/index.js';
import { actions } from './+page.server';
import { actions as detailActions } from './[id]/+page.server';

const companionId = 'mp-comp';
const other = 'mp-other';
const archived = 'mp-archived';

function form(fields: Record<string, string>) {
	const fd = new FormData();
	for (const [k, v] of Object.entries(fields)) fd.set(k, v);
	return fd;
}

type Result = { status?: number; data?: { error?: string; values?: unknown } };
type Action = (e: never) => Promise<unknown>;
function call(
	action: unknown,
	fields: Record<string, string>,
	opts: { role?: string; id?: string; companionId?: string } = {}
) {
	const event = {
		request: { formData: async () => form(fields) },
		params: { companionId: opts.companionId ?? companionId, id: opts.id ?? '' },
		locals: { user: { id: 'mp-user', role: opts.role ?? 'member' }, locale: 'en' }
	};
	return (action as Action)(event as never) as Promise<Result>;
}

async function med(
	companion = companionId,
	endedOn: string | null = null,
	startedOn = '2026-01-01'
) {
	const id = `mp-med-${Math.random().toString(36).slice(2)}`;
	await db
		.insert(schema.medications)
		.values({ id, companionId: companion, name: 'Carprofen', startedOn, endedOn });
	return id;
}
const doses = (m: string) =>
	db.query.medicationDoses.findMany({ where: eq(schema.medicationDoses.medicationId, m) });

describe('medications page actions', () => {
	beforeAll(async () => {
		await db.insert(schema.users).values({
			id: 'mp-user',
			username: 'mp-user',
			displayName: 'MP',
			role: 'member'
		} as typeof schema.users.$inferInsert);
		await db.insert(schema.companions).values([
			{ id: companionId, name: 'MP' },
			{ id: other, name: 'Other' },
			{ id: archived, name: 'Gone', isActive: false }
		] as (typeof schema.companions.$inferInsert)[]);
	});

	it('create stores the medication for this companion', async () => {
		const res = await call(actions.create, { name: 'mp-new', dose: '1 tablet' });
		expect(res).toEqual({ created: true });
		const row = await db.query.medications.findFirst({
			where: eq(schema.medications.name, 'mp-new')
		});
		expect(row).toMatchObject({ companionId, dose: '1 tablet', loggedBy: 'mp-user' });
	});

	it('create returns what was typed when it fails', async () => {
		const res = await call(actions.create, { name: ' ', dose: '2 ml' });
		expect(res.status).toBe(400);
		expect(res.data?.values).toMatchObject({ name: ' ', dose: '2 ml' });
	});

	it('caretakers cannot create or log doses here', async () => {
		const m = await med();
		expect((await call(actions.create, { name: 'x' }, { role: 'caretaker' })).status).toBe(403);
		expect((await call(actions.given, { id: m }, { role: 'caretaker' })).status).toBe(403);
		expect(await doses(m)).toHaveLength(0);
	});

	it("given refuses another companion's medication", async () => {
		const m = await med(other);
		const res = await call(actions.given, { id: m });
		expect(res.status).toBe(404);
		expect(await doses(m)).toHaveLength(0);
	});

	it('given logs a dose, and refuses an ended medication', async () => {
		const m = await med();
		expect(await call(actions.given, { id: m })).toEqual({ doseLogged: 'Carprofen' });
		expect(await doses(m)).toHaveLength(1);

		const ended = await med(companionId, '2020-01-01');
		const res = await call(actions.given, { id: ended });
		expect(res.status).toBe(400);
		expect(res.data?.error).toBe('This medication has ended.');
	});

	it("given refuses a medication that hasn't started yet", async () => {
		const m = await med(companionId, null, '2999-01-01');
		const res = await call(actions.given, { id: m });
		expect(res.status).toBe(400);
		expect(res.data?.error).toBe("This medication hasn't started yet.");
		expect(await doses(m)).toHaveLength(0);
	});

	it('refuses an unknown or archived companion', async () => {
		const missing = await call(actions.create, { name: 'mp-ghost' }, { companionId: 'nope' });
		expect(missing.status).toBe(404);
		expect((await call(actions.create, { name: 'mp-x' }, { companionId: archived })).status).toBe(
			403
		);
		const m = await med(archived);
		expect((await call(actions.given, { id: m }, { companionId: archived })).status).toBe(403);
		for (const name of ['update', 'end', 'restart', 'delete'] as const) {
			const res = await call(
				detailActions[name],
				{ name: 'mp-y' },
				{ id: m, companionId: archived }
			);
			expect(res.status).toBe(403);
		}
		expect(await doses(m)).toHaveLength(0);
		const row = await db.query.medications.findFirst({ where: eq(schema.medications.id, m) });
		expect(row).toMatchObject({ name: 'Carprofen', endedOn: null });
	});

	it('end refuses an ended medication and one that has not started', async () => {
		const ended = await med(companionId, '2020-01-01');
		const res = await call(detailActions.end, {}, { id: ended });
		expect(res).toMatchObject({ status: 400, data: { error: 'This medication has ended.' } });
		const future = await med(companionId, null, '2999-01-01');
		const early = await call(detailActions.end, {}, { id: future });
		expect(early).toMatchObject({
			status: 400,
			data: { error: "This medication hasn't started yet." }
		});
		const rows = await db.query.medications.findMany({
			where: (m, { inArray }) => inArray(m.id, [ended, future])
		});
		expect(rows.map((r) => r.endedOn).sort()).toEqual(['2020-01-01', null].sort());
	});

	it('deleteDose removes a dose of this medication, owners only', async () => {
		const m = await med();
		expect(await call(actions.given, { id: m })).toEqual({ doseLogged: 'Carprofen' });
		const [dose] = await doses(m);
		const caretaker = await call(
			detailActions.deleteDose,
			{ doseId: dose.id },
			{
				id: m,
				role: 'caretaker'
			}
		);
		expect(caretaker.status).toBe(403);
		const elsewhere = await call(
			detailActions.deleteDose,
			{ doseId: dose.id },
			{
				id: m,
				companionId: other
			}
		);
		expect(elsewhere.status).toBe(404);
		expect(await doses(m)).toHaveLength(1);
		expect(await call(detailActions.deleteDose, { doseId: dose.id }, { id: m })).toEqual({
			doseRemoved: true
		});
		expect(await doses(m)).toHaveLength(0);
		const again = await call(detailActions.deleteDose, { doseId: dose.id }, { id: m });
		expect(again).toMatchObject({ status: 404, data: { error: 'Dose not found.' } });
	});

	it("detail actions don't touch another companion's medication", async () => {
		const m = await med(other);
		for (const name of ['end', 'restart', 'delete'] as const) {
			const res = await call(detailActions[name], {}, { id: m });
			expect(res.status).toBe(404);
		}
		const row = await db.query.medications.findFirst({ where: eq(schema.medications.id, m) });
		expect(row?.endedOn).toBeNull();
	});
});
