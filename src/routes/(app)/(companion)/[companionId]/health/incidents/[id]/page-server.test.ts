import { describe, it, expect, beforeAll } from 'vitest';
import { eq } from 'drizzle-orm';
import { db, schema } from '#lib/server/db/index.js';
import { actions } from './+page.server';

const C = 'ip-comp';
type Action = (typeof actions)[keyof typeof actions];

function call(action: Action, id: string, fields: Record<string, string> = {}, companionId = C) {
	const fd = new FormData();
	for (const [k, v] of Object.entries(fields)) fd.set(k, v);
	return action({
		params: { companionId, id },
		request: new Request('http://localhost/', { method: 'POST', body: fd }),
		locals: { user: { id: 'ip-mem', role: 'member' }, locale: 'en' }
	} as unknown as Parameters<Action>[0]);
}

const status = (r: unknown) => (r as { status?: number } | undefined)?.status;

describe('incident page actions', () => {
	beforeAll(async () => {
		await db
			.insert(schema.users)
			.values({ id: 'ip-mem', username: 'ip-mem', displayName: 'M', role: 'member' });
		await db.insert(schema.companions).values({ id: C, name: 'IP' });
		await db.insert(schema.healthEvents).values([
			{
				id: 'ip-inc',
				companionId: C,
				type: 'incident',
				title: 'Limp',
				occurredAt: new Date(2026, 0, 5)
			},
			{
				id: 'ip-inc2',
				companionId: C,
				type: 'incident',
				title: 'Itch',
				occurredAt: new Date(2026, 0, 5)
			}
		] as (typeof schema.healthEvents.$inferInsert)[]);
		await db.insert(schema.healthEventUpdates).values({
			id: 'ip-up-other',
			healthEventId: 'ip-inc2',
			body: 'x',
			occurredAt: new Date(2026, 0, 6)
		});
	});

	it('resolve writes the closing update at the resolved time', async () => {
		const at = new Date(2026, 0, 9, 10).toISOString();
		await call(actions.resolve, 'ip-inc', { resolvedAt: at, body: 'All better', severity: 'mild' });
		const inc = await db.query.healthEvents.findFirst({
			where: eq(schema.healthEvents.id, 'ip-inc')
		});
		expect(inc?.resolvedAt?.toISOString()).toBe(at);
		const ups = await db.query.healthEventUpdates.findMany({
			where: eq(schema.healthEventUpdates.healthEventId, 'ip-inc')
		});
		expect(ups).toHaveLength(1);
		expect(ups[0]).toMatchObject({ body: 'All better', severity: 'mild', loggedBy: 'ip-mem' });
		expect(ups[0].occurredAt.toISOString()).toBe(at);

		await call(actions.reopen, 'ip-inc');
		const again = await db.query.healthEvents.findFirst({
			where: eq(schema.healthEvents.id, 'ip-inc')
		});
		expect(again?.resolvedAt).toBeNull();
	});

	it('resolve without a body adds no update and rejects a time before the start', async () => {
		const before = new Date(2026, 0, 1).toISOString();
		expect(status(await call(actions.resolve, 'ip-inc2', { resolvedAt: before }))).toBe(400);
		await call(actions.resolve, 'ip-inc2', { resolvedAt: '', body: '  ' });
		const ups = await db.query.healthEventUpdates.findMany({
			where: eq(schema.healthEventUpdates.healthEventId, 'ip-inc2')
		});
		expect(ups.map((u) => u.id)).toEqual(['ip-up-other']);
	});

	it('edit and delete need an update of this incident', async () => {
		expect(status(await call(actions.deleteUpdate, 'ip-inc'))).toBe(404);
		expect(status(await call(actions.deleteUpdate, 'ip-inc', { updateId: 'ip-up-other' }))).toBe(
			404
		);
		expect(
			status(await call(actions.editUpdate, 'ip-inc', { updateId: 'ip-up-other', body: 'y' }))
		).toBe(404);
		const kept = await db.query.healthEventUpdates.findFirst({
			where: eq(schema.healthEventUpdates.id, 'ip-up-other')
		});
		expect(kept?.body).toBe('x');
	});

	it('404 for an incident under another companion', async () => {
		expect(status(await call(actions.addUpdate, 'ip-inc', { body: 'x' }, 'nope'))).toBe(404);
	});
});
