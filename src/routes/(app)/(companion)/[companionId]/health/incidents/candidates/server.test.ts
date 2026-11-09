import { describe, it, expect, beforeAll } from 'vitest';
import { db, schema } from '#lib/server/db/index.js';
import { GET } from './+server';

const C = 'cand-comp';

function call(role: 'member' | 'caretaker' | null, query: string, companionId = C) {
	return (async () =>
		GET({
			params: { companionId },
			url: new URL(`http://localhost/x?${query}`),
			locals: { user: role ? { id: `cand-${role}`, role } : null, locale: 'en' }
		} as unknown as Parameters<typeof GET>[0]))().catch((e: unknown) => e as Response);
}

describe('incident candidates endpoint', () => {
	beforeAll(async () => {
		await db.insert(schema.companions).values([
			{ id: C, name: 'Cand' },
			{ id: 'cand-other', name: 'Other' }
		]);
		await db.insert(schema.healthEvents).values([
			{ id: 'cand-vet', companionId: C, type: 'vet_visit', title: 'Vet', occurredAt: new Date() },
			{ id: 'cand-inc', companionId: C, type: 'incident', title: 'Limp', occurredAt: new Date() },
			{
				id: 'cand-foreign',
				companionId: 'cand-other',
				type: 'vet_visit',
				title: 'Foreign',
				occurredAt: new Date()
			}
		] as (typeof schema.healthEvents.$inferInsert)[]);
	});

	it('rejects anonymous with 401 and caretakers with 403', async () => {
		expect((await call(null, 'eventId=cand-vet')).status).toBe(401);
		expect((await call('caretaker', 'eventId=cand-vet')).status).toBe(403);
	});

	it('lists incidents for a member', async () => {
		const res = await call('member', 'eventId=cand-vet');
		const rows = (await res.json()) as { id: string; title: string }[];
		expect(rows.map((r) => r.id)).toEqual(['cand-inc']);
	});

	it('404s for an event of another companion or an incident itself', async () => {
		expect((await call('member', 'eventId=cand-foreign')).status).toBe(404);
		expect((await call('member', 'eventId=cand-inc')).status).toBe(404);
		expect((await call('member', '')).status).toBe(404);
	});
});
