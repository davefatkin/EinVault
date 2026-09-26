import { describe, it, expect, beforeAll } from 'vitest';
import { eq } from 'drizzle-orm';
import { db, schema } from '$lib/server/db';
import { actions } from './+page.server';

// Regression coverage for a task-6 review finding: addActivity must keep
// inserting for the primary companion even when it's archived (the journal
// page for an archived companion is still reachable for backfilling), while
// still enforcing the species rule. This exercises the actual route action
// (not just the extracted helper) because the archived-primary behavior
// lives in the action's own target-id computation, not in a shared helper.
describe('addActivity (route action)', () => {
	const companionId = 'ps-archived-primary';
	const userId = 'ps-member';

	beforeAll(async () => {
		await db.insert(schema.users).values({
			id: userId,
			username: userId,
			displayName: 'Member',
			role: 'member'
		} as typeof schema.users.$inferInsert);
		await db.insert(schema.companions).values({
			id: companionId,
			name: 'Old Dog',
			species: 'dog',
			isActive: false
		} as typeof schema.companions.$inferInsert);
	});

	function event(formEntries: [string, string][]) {
		const form = new FormData();
		for (const [k, v] of formEntries) form.append(k, v);
		return {
			params: { companionId, date: '2026-01-01' },
			request: { formData: async () => form },
			locals: { user: { id: userId, role: 'member' as const }, locale: 'en' as const }
		} as Parameters<typeof actions.addActivity>[0];
	}

	it('still inserts a row for an archived primary companion', async () => {
		const result = await actions.addActivity(event([['type', 'walk']]));
		expect(result).toEqual({ addSuccess: true });

		const rows = await db.query.dailyEvents.findMany({
			where: eq(schema.dailyEvents.companionId, companionId)
		});
		expect(rows).toHaveLength(1);
		expect(rows[0].type).toBe('walk');
	});

	it('still rejects a type the archived primary’s species cannot have', async () => {
		const result = await actions.addActivity(event([['type', 'litter']]));
		expect(result).toMatchObject({ status: 400 });

		const rows = await db.query.dailyEvents.findMany({
			where: eq(schema.dailyEvents.companionId, companionId)
		});
		// still just the one row from the previous test — nothing written
		expect(rows).toHaveLength(1);
	});
});
