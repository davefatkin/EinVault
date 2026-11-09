import { describe, it, expect, beforeAll } from 'vitest';
import { eq } from 'drizzle-orm';
import { db, schema } from '#lib/server/db/index.js';
import { actions } from './+page.server';
import { actions as detailActions } from './[id]/+page.server';

const companionId = 'mp-comp';
const other = 'mp-other';

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
	opts: { role?: string; id?: string } = {}
) {
	const event = {
		request: { formData: async () => form(fields) },
		params: { companionId, id: opts.id ?? '' },
		locals: { user: { id: 'mp-user', role: opts.role ?? 'member' }, locale: 'en' }
	};
	return (action as Action)(event as never) as Promise<Result>;
}

async function med(companion = companionId, endedOn: string | null = null) {
	const id = `mp-med-${Math.random().toString(36).slice(2)}`;
	await db
		.insert(schema.medications)
		.values({ id, companionId: companion, name: 'Carprofen', startedOn: '2026-01-01', endedOn });
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
			{ id: other, name: 'Other' }
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
