import { describe, it, expect, beforeAll } from 'vitest';
import { eq } from 'drizzle-orm';
import { db, schema } from '#lib/server/db/index.js';
import { actions } from './+page.server';

const C = 'in-comp';

const ARCHIVED = 'in-archived';

function create(fields: Record<string, string>, role = 'member', companionId = C) {
	const fd = new FormData();
	for (const [k, v] of Object.entries(fields)) fd.set(k, v);
	return actions.create({
		params: { companionId },
		request: new Request('http://localhost/', { method: 'POST', body: fd }),
		locals: { user: { id: 'in-mem', role }, locale: 'en' }
	} as unknown as Parameters<typeof actions.create>[0]);
}

describe('new incident action', () => {
	beforeAll(async () => {
		await db
			.insert(schema.users)
			.values({ id: 'in-mem', username: 'in-mem', displayName: 'M', role: 'member' });
		await db.insert(schema.companions).values([
			{ id: C, name: 'IN' },
			{ id: ARCHIVED, name: 'Gone', isActive: false }
		]);
	});

	it('returns the id and an "other" reminder link for Save & Add Reminder', async () => {
		const r = (await create({
			title: 'Limp',
			severity: 'severe',
			afterSave: 'client',
			andReminder: '1'
		})) as { id: string; reminderUrl: string };
		const row = await db.query.healthEvents.findFirst({
			where: eq(schema.healthEvents.id, r.id)
		});
		expect(row).toMatchObject({ companionId: C, type: 'incident', severity: 'severe' });
		expect(r.reminderUrl).toContain(`/${C}/reminders?`);
		expect(r.reminderUrl).toContain('type=other');
	});

	it('redirects to the incident page without JavaScript', async () => {
		const err = await Promise.resolve(create({ title: 'Cough' })).catch((e: unknown) => e);
		expect(err).toMatchObject({ status: 303 });
		expect((err as { location: string }).location).toMatch(
			new RegExp(`^/${C}/health/incidents/[^/]+$`)
		);
	});

	it('403 on an archived companion, nothing created', async () => {
		expect(
			await create({ title: 'Too late', afterSave: 'client' }, 'member', ARCHIVED)
		).toMatchObject({ status: 403 });
		const rows = await db.query.healthEvents.findMany({
			where: eq(schema.healthEvents.companionId, ARCHIVED)
		});
		expect(rows).toHaveLength(0);
	});

	it('403 for a caretaker', async () => {
		expect(await create({ title: 'X' }, 'caretaker')).toMatchObject({ status: 403 });
	});
});
