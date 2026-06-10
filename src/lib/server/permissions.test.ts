import { describe, it, expect, beforeAll } from 'vitest';
import { db, schema } from '$lib/server/db';
import { assertCanEditCompanion } from './permissions';

type Locals = Parameters<typeof assertCanEditCompanion>[0];

function locals(user: { id: string; role: 'admin' | 'member' | 'caretaker' } | null): Locals {
	return { user, session: null, locale: 'en' } as unknown as Locals;
}

async function statusOf(p: Promise<void>): Promise<number | 'ok'> {
	try {
		await p;
		return 'ok';
	} catch (e) {
		return (e as { status: number }).status;
	}
}

describe('assertCanEditCompanion', () => {
	beforeAll(async () => {
		await db.insert(schema.users).values([
			{ id: 'adm', username: 'adm', displayName: 'A', role: 'admin' },
			{ id: 'mem', username: 'mem', displayName: 'M', role: 'member' },
			{ id: 'ct-in', username: 'ctin', displayName: 'C1', role: 'caretaker' },
			{ id: 'ct-out', username: 'ctout', displayName: 'C2', role: 'caretaker' }
		] as (typeof schema.users.$inferInsert)[]);
		await db.insert(schema.companions).values({
			id: 'comp1',
			name: 'Comp'
		} as typeof schema.companions.$inferInsert);
		await db.insert(schema.companionCaretakers).values({
			companionId: 'comp1',
			userId: 'ct-in'
		} as typeof schema.companionCaretakers.$inferInsert);
	});

	it('401 for anonymous', async () => {
		expect(await statusOf(assertCanEditCompanion(locals(null), 'comp1'))).toBe(401);
	});

	it('allows admins and members', async () => {
		expect(
			await statusOf(assertCanEditCompanion(locals({ id: 'adm', role: 'admin' }), 'comp1'))
		).toBe('ok');
		expect(
			await statusOf(assertCanEditCompanion(locals({ id: 'mem', role: 'member' }), 'comp1'))
		).toBe('ok');
	});

	it('allows assigned caretakers, 403 for unassigned', async () => {
		expect(
			await statusOf(assertCanEditCompanion(locals({ id: 'ct-in', role: 'caretaker' }), 'comp1'))
		).toBe('ok');
		expect(
			await statusOf(assertCanEditCompanion(locals({ id: 'ct-out', role: 'caretaker' }), 'comp1'))
		).toBe(403);
	});
});
