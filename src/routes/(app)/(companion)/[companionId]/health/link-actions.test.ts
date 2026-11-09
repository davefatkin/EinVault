import { describe, it, expect, beforeAll } from 'vitest';
import { db, schema } from '#lib/server/db/index.js';
import { listLinkedEvents } from '#lib/server/incident-links.js';
import { actions } from './+page.server';

const C = 'hl-comp';

function call(
	name: 'linkIncident' | 'unlinkIncident',
	fields: Record<string, string>,
	role: 'member' | 'caretaker' | null = 'member'
) {
	const fd = new FormData();
	for (const [k, v] of Object.entries(fields)) fd.set(k, v);
	return actions[name]({
		params: { companionId: C },
		request: new Request('http://localhost/', { method: 'POST', body: fd }),
		locals: { user: role ? { id: 'hl-mem', role } : null, locale: 'en' }
	} as unknown as Parameters<typeof actions.linkIncident>[0]);
}
const status = (r: unknown) => (r as { status?: number } | undefined)?.status;

describe('health page incident link actions', () => {
	beforeAll(async () => {
		await db.insert(schema.users).values({ id: 'hl-mem', username: 'hl-mem', displayName: 'M' });
		await db.insert(schema.companions).values([
			{ id: C, name: 'HL' },
			{ id: 'hl-other', name: 'Other' }
		]);
		await db.insert(schema.healthEvents).values([
			{ id: 'hl-inc', companionId: C, type: 'incident', title: 'Limp', occurredAt: new Date() },
			{ id: 'hl-vet', companionId: C, type: 'vet_visit', title: 'Vet', occurredAt: new Date() },
			{
				id: 'hl-ovet',
				companionId: 'hl-other',
				type: 'vet_visit',
				title: 'X',
				occurredAt: new Date()
			}
		] as (typeof schema.healthEvents.$inferInsert)[]);
	});

	it('links and unlinks', async () => {
		const fields = { incidentId: 'hl-inc', healthEventId: 'hl-vet' };
		expect(await call('linkIncident', fields)).toEqual({ incidentLinkSuccess: true });
		expect((await listLinkedEvents(C, 'hl-inc')).map((e) => e.id)).toEqual(['hl-vet']);
		expect(await call('unlinkIncident', fields)).toEqual({ incidentLinkSuccess: true });
		expect(await listLinkedEvents(C, 'hl-inc')).toEqual([]);
	});

	it('rejects caretakers, anonymous users and foreign events', async () => {
		const fields = { incidentId: 'hl-inc', healthEventId: 'hl-vet' };
		expect(status(await call('linkIncident', fields, 'caretaker'))).toBe(403);
		expect(status(await call('linkIncident', fields, null))).toBe(401);
		expect(
			status(await call('linkIncident', { incidentId: 'hl-inc', healthEventId: 'hl-ovet' }))
		).toBe(404);
	});
});
