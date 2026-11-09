import { describe, it, expect, beforeAll } from 'vitest';
import { db, schema } from '#lib/server/db/index.js';
import { load } from './+layout.server';

// The shell's care status counts open incidents as "needs attention".
describe('(app) layout care status', () => {
	beforeAll(async () => {
		await db.insert(schema.users).values({
			id: 'ls-mem',
			username: 'ls-mem',
			displayName: 'M',
			role: 'member'
		} as typeof schema.users.$inferInsert);
		await db.insert(schema.companions).values([
			{ id: 'ls-open', name: 'Open' },
			{ id: 'ls-resolved', name: 'Resolved' }
		] as (typeof schema.companions.$inferInsert)[]);
		const at = new Date(Date.now() - 60 * 60 * 1000);
		await db.insert(schema.healthEvents).values([
			{ id: 'ls-inc-1', companionId: 'ls-open', type: 'incident', title: 'A', occurredAt: at },
			{ id: 'ls-inc-2', companionId: 'ls-open', type: 'incident', title: 'B', occurredAt: at },
			{
				id: 'ls-inc-3',
				companionId: 'ls-resolved',
				type: 'incident',
				title: 'C',
				occurredAt: at,
				resolvedAt: new Date()
			},
			{ id: 'ls-vet', companionId: 'ls-resolved', type: 'vet_visit', title: 'D', occurredAt: at }
		] as (typeof schema.healthEvents.$inferInsert)[]);
	});

	it('counts open incidents per companion and marks them needs-attention', async () => {
		const data = (await load({
			locals: { user: { id: 'ls-mem', role: 'member' }, locale: 'en' }
		} as unknown as Parameters<typeof load>[0])) as {
			companionStatus: Record<string, string>;
			openIncidentCounts: Record<string, number>;
		};
		expect(data.openIncidentCounts).toEqual({ 'ls-open': 2 });
		expect(data.companionStatus['ls-open']).toBe('needs-attention');
		expect(data.companionStatus['ls-resolved']).toBe('up-to-date');
	});
});
