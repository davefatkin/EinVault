import { describe, it, expect, beforeAll } from 'vitest';
import { eq } from 'drizzle-orm';
import { db, schema } from '$lib/server/db';
import { actions, load } from './+page.server';

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

// #344: the day's activity list must follow when the activity happened
// (loggedAt), not when it was entered. A backdated entry is created after
// the entries it precedes.
describe('load activity order', () => {
	const companionId = 'ps-order';

	beforeAll(async () => {
		await db.insert(schema.companions).values({
			id: companionId,
			name: 'Order Dog',
			species: 'dog'
		} as typeof schema.companions.$inferInsert);
		await db.insert(schema.dailyEvents).values([
			{
				id: 'ps-order-late',
				companionId,
				type: 'bathroom',
				loggedAt: new Date(2026, 0, 1, 9, 50),
				createdAt: new Date(2026, 0, 1, 9, 50)
			},
			{
				id: 'ps-order-backdated',
				companionId,
				type: 'walk',
				loggedAt: new Date(2026, 0, 1, 8, 55),
				createdAt: new Date(2026, 0, 1, 10, 0)
			}
		]);
	});

	it('orders the day by loggedAt, newest first', async () => {
		const data = (await load({
			params: { companionId, date: '2026-01-01' },
			locals: { user: { id: 'ps-member', role: 'member' }, locale: 'en' },
			parent: async () => ({ companion: { id: companionId } })
		} as unknown as Parameters<typeof load>[0])) as { dailyEvents: { id: string }[] };

		expect(data.dailyEvents.map((e) => e.id)).toEqual(['ps-order-late', 'ps-order-backdated']);
	});
});

describe('load health records', () => {
	const companionId = 'ps-items';

	beforeAll(async () => {
		await db.insert(schema.companions).values({
			id: companionId,
			name: 'Items Dog',
			species: 'dog'
		} as typeof schema.companions.$inferInsert);
		await db.insert(schema.healthEvents).values({
			id: 'ps-items-health',
			companionId,
			type: 'vaccination',
			title: 'Rabies booster',
			occurredAt: new Date(2026, 0, 2, 12, 0)
		});
		await db.insert(schema.weightEntries).values({
			id: 'ps-items-other-day',
			companionId,
			weight: 20,
			unit: 'kg',
			recordedAt: new Date(2026, 0, 3, 12, 0)
		});
	});

	const loadDate = async (date: string) =>
		(await load({
			params: { companionId, date },
			locals: { user: { id: 'ps-member', role: 'member' }, locale: 'en' },
			parent: async () => ({ companion: { id: companionId } })
		} as unknown as Parameters<typeof load>[0])) as { dayItems: Record<string, unknown>[] };

	it("returns only that date's items, with display fields only", async () => {
		const data = await loadDate('2026-01-02');
		expect(data.dayItems).toHaveLength(1);
		expect(data.dayItems[0]).toMatchObject({ kind: 'health', id: 'ps-items-health' });
		expect(Object.keys(data.dayItems[0]).sort()).toEqual(
			[
				'at',
				'documents',
				'fromLink',
				'id',
				'journalDates',
				'kind',
				'linkedHere',
				'logger',
				'notes',
				'title',
				'type',
				'vetClinic',
				'vetName'
			].sort()
		);
	});

	it('returns an empty list for a day without items', async () => {
		expect((await loadDate('2026-01-05')).dayItems).toEqual([]);
	});
});

describe('linkHealth / unlinkHealth actions', () => {
	const active = 'ps-link-active';
	const archived = 'ps-link-archived';

	beforeAll(async () => {
		await db.insert(schema.companions).values([
			{ id: active, name: 'Active', species: 'dog' },
			{ id: archived, name: 'Archived', species: 'dog', isActive: false }
		] as (typeof schema.companions.$inferInsert)[]);
		await db.insert(schema.healthEvents).values([
			{
				id: 'ps-link-ev',
				companionId: active,
				type: 'vet_visit',
				title: 'V',
				occurredAt: new Date(2026, 0, 1, 12)
			},
			{
				id: 'ps-link-ev-arch',
				companionId: archived,
				type: 'vet_visit',
				title: 'A',
				occurredAt: new Date(2026, 0, 1, 12)
			}
		]);
	});

	const call = (
		action: 'linkHealth' | 'unlinkHealth',
		companionId: string,
		date: string,
		id: string
	) => {
		const form = new FormData();
		form.set('healthEventId', id);
		return actions[action]({
			params: { companionId, date },
			request: { formData: async () => form },
			locals: { user: { id: 'ps-member', role: 'member' as const }, locale: 'en' as const }
		} as Parameters<typeof actions.linkHealth>[0]);
	};

	it('links, maps errors to status codes, and unlinks', async () => {
		expect(await call('linkHealth', active, '2026-01-10', 'ps-link-ev')).toEqual({
			linkSuccess: true
		});
		expect(await call('linkHealth', active, '2026-01-10', 'ps-link-ev-arch')).toMatchObject({
			status: 404
		});
		expect(await call('linkHealth', active, '2026-01-01', 'ps-link-ev')).toMatchObject({
			status: 400
		});
		expect(await call('linkHealth', active, 'not-a-date', 'ps-link-ev')).toMatchObject({
			status: 400
		});
		expect(await call('unlinkHealth', active, '2026-01-10', 'ps-link-ev')).toEqual({
			unlinkSuccess: true
		});
	});

	it('rejects archived companions with 403', async () => {
		expect(await call('linkHealth', archived, '2026-01-10', 'ps-link-ev-arch')).toMatchObject({
			status: 403
		});
		expect(await call('unlinkHealth', archived, '2026-01-10', 'ps-link-ev-arch')).toMatchObject({
			status: 403
		});
	});

	it('load returns linkableHealthEvents, empty for archived companions', async () => {
		const loadFor = async (companionId: string, isActive: boolean) =>
			(await load({
				params: { companionId, date: '2026-01-20' },
				locals: { user: { id: 'ps-member', role: 'member' }, locale: 'en' },
				parent: async () => ({ companion: { id: companionId, isActive } })
			} as unknown as Parameters<typeof load>[0])) as { linkableHealthEvents: { id: string }[] };
		expect((await loadFor(active, true)).linkableHealthEvents.map((e) => e.id)).toEqual([
			'ps-link-ev'
		]);
		expect((await loadFor(archived, false)).linkableHealthEvents).toEqual([]);
	});
});
