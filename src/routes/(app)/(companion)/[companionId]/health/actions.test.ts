import { describe, it, expect, beforeAll } from 'vitest';
import { eq } from 'drizzle-orm';
import { db, schema } from '#lib/server/db/index.js';
import { reminderPrefillUrl } from '#lib/health.js';
import { actions, load } from './+page.server';

const C = 'ha-comp';
const ARCHIVED = 'ha-arch';

function call(name: 'addHealth' | 'updateHealth', fields: Record<string, string>) {
	const fd = new FormData();
	for (const [k, v] of Object.entries(fields)) fd.set(k, v);
	return actions[name]({
		params: { companionId: C },
		request: new Request('http://localhost/', { method: 'POST', body: fd }),
		locals: { user: { id: 'ha-mem', role: 'member' }, locale: 'en' }
	} as unknown as Parameters<typeof actions.addHealth>[0]);
}

function runLoad(id: string, isActive: boolean) {
	return load({
		params: { companionId: id },
		url: new URL(`http://localhost/${id}/health`),
		locals: { user: { id: 'ha-mem', role: 'member' }, locale: 'en' },
		parent: async () => ({ companion: { id, isActive } })
	} as unknown as Parameters<typeof load>[0]) as Promise<{
		attachableDocuments: { id: string }[];
		uploadMaxMb: number;
	}>;
}

const form = {
	type: 'vet_visit',
	title: 'Checkup',
	notes: 'All good',
	occurredAt: '2026-03-04T10:00'
};

describe('health page actions', () => {
	beforeAll(async () => {
		await db.insert(schema.users).values({ id: 'ha-mem', username: 'ha-mem', displayName: 'M' });
		await db.insert(schema.companions).values([
			{ id: C, name: 'HA' },
			{ id: ARCHIVED, name: 'Old' }
		] as (typeof schema.companions.$inferInsert)[]);
		await db.insert(schema.healthEvents).values({
			id: 'ha-ev',
			companionId: C,
			type: 'vet_visit',
			title: 'Existing',
			occurredAt: new Date(2026, 0, 5, 12)
		} as typeof schema.healthEvents.$inferInsert);
		const doc = { mimeType: 'application/pdf', provider: 'local' as const };
		await db.insert(schema.documents).values([
			{
				...doc,
				id: 'ha-d-att',
				companionId: C,
				healthEventId: 'ha-ev',
				filename: 'a.pdf',
				storageKey: 'a',
				title: 'Attached'
			},
			{
				...doc,
				id: 'ha-d-free',
				companionId: C,
				filename: 'b.pdf',
				storageKey: 'b',
				title: 'Free'
			},
			{
				...doc,
				id: 'ha-d-arch',
				companionId: ARCHIVED,
				filename: 'c.pdf',
				storageKey: 'c',
				title: 'Old free'
			}
		]);
	});

	it('addHealth returns the new id, its day and no reminder url', async () => {
		const res = (await call('addHealth', form)) as {
			healthEventId: string;
			day: string;
			reminderUrl: string | null;
		};
		expect(res).toEqual({
			healthEventId: expect.any(String),
			day: '2026-03-04',
			reminderUrl: null
		});
		const row = await db.query.healthEvents.findFirst({
			where: eq(schema.healthEvents.id, res.healthEventId)
		});
		expect(row?.companionId).toBe(C);
	});

	it('addHealth with andReminder=1 returns a prefilled reminder url', async () => {
		const res = (await call('addHealth', { ...form, andReminder: '1' })) as {
			reminderUrl: string | null;
		};
		expect(res.reminderUrl).toBe(reminderPrefillUrl(C, 'vet_visit', 'Checkup', 'All good'));
	});

	it("updateHealth returns the updated event's day", async () => {
		const res = await call('updateHealth', {
			...form,
			id: 'ha-ev',
			occurredAt: '2026-05-06T09:00'
		});
		expect(res).toEqual({ updateHealthSuccess: true, day: '2026-05-06' });
	});

	it('load lists unattached documents only, and none for an archived pet', async () => {
		const data = await runLoad(C, true);
		expect(data.attachableDocuments.map((d) => d.id)).toEqual(['ha-d-free']);
		expect(typeof data.uploadMaxMb).toBe('number');
		expect((await runLoad(ARCHIVED, false)).attachableDocuments).toEqual([]);
	});
});
