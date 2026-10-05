import { describe, it, expect, beforeAll } from 'vitest';
import { db, schema } from '$lib/server/db';
import { localDateISO } from '$lib/date';
import { assertCanWriteJournalMedia } from './permissions';

type Locals = Parameters<typeof assertCanWriteJournalMedia>[0];
type Role = 'admin' | 'member' | 'caretaker';

function locals(user: { id: string; role: Role } | null): Locals {
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

const today = localDateISO();
const yesterday = localDateISO(new Date(Date.now() - 24 * 60 * 60 * 1000));

describe('assertCanWriteJournalMedia', () => {
	beforeAll(async () => {
		await db.insert(schema.users).values([
			{ id: 'adm', username: 'adm', displayName: 'A', role: 'admin' },
			{ id: 'mem', username: 'mem', displayName: 'M', role: 'member' },
			{ id: 'ct-on', username: 'cton', displayName: 'C1', role: 'caretaker' },
			{ id: 'ct-off', username: 'ctoff', displayName: 'C2', role: 'caretaker' },
			{ id: 'ct-other', username: 'ctother', displayName: 'C3', role: 'caretaker' }
		] as (typeof schema.users.$inferInsert)[]);
		await db.insert(schema.companions).values([
			{ id: 'comp1', name: 'Comp' },
			{ id: 'comp-archived', name: 'Old', isActive: false }
		] as (typeof schema.companions.$inferInsert)[]);
		await db.insert(schema.companionCaretakers).values([
			{ companionId: 'comp1', userId: 'ct-on' },
			{ companionId: 'comp-archived', userId: 'ct-on' },
			{ companionId: 'comp1', userId: 'ct-off' }
		] as (typeof schema.companionCaretakers.$inferInsert)[]);
		const now = Date.now();
		await db.insert(schema.caretakerShifts).values([
			{
				id: 'shift-on',
				userId: 'ct-on',
				startAt: new Date(now - 60 * 60 * 1000),
				endAt: new Date(now + 60 * 60 * 1000)
			},
			{
				id: 'shift-other',
				userId: 'ct-other',
				startAt: new Date(now - 60 * 60 * 1000),
				endAt: new Date(now + 60 * 60 * 1000)
			},
			{
				id: 'shift-off-past',
				userId: 'ct-off',
				startAt: new Date(now - 3 * 60 * 60 * 1000),
				endAt: new Date(now - 2 * 60 * 60 * 1000)
			}
		] as (typeof schema.caretakerShifts.$inferInsert)[]);
	});

	it('401 for anonymous', async () => {
		expect(await statusOf(assertCanWriteJournalMedia(locals(null), 'comp1'))).toBe(401);
	});

	it('allows admins and members for any date and archived companions', async () => {
		for (const user of [
			{ id: 'adm', role: 'admin' as const },
			{ id: 'mem', role: 'member' as const }
		]) {
			expect(await statusOf(assertCanWriteJournalMedia(locals(user), 'comp1', yesterday))).toBe(
				'ok'
			);
			expect(await statusOf(assertCanWriteJournalMedia(locals(user), 'comp-archived'))).toBe('ok');
		}
	});

	it('allows an assigned caretaker on shift, for today', async () => {
		const ct = locals({ id: 'ct-on', role: 'caretaker' });
		expect(await statusOf(assertCanWriteJournalMedia(ct, 'comp1'))).toBe('ok');
		expect(await statusOf(assertCanWriteJournalMedia(ct, 'comp1', today))).toBe('ok');
	});

	it('403 for a caretaker on shift writing another date', async () => {
		const ct = locals({ id: 'ct-on', role: 'caretaker' });
		expect(await statusOf(assertCanWriteJournalMedia(ct, 'comp1', yesterday))).toBe(403);
	});

	it('403 for an assigned caretaker off shift', async () => {
		const ct = locals({ id: 'ct-off', role: 'caretaker' });
		expect(await statusOf(assertCanWriteJournalMedia(ct, 'comp1'))).toBe(403);
		expect(await statusOf(assertCanWriteJournalMedia(ct, 'comp1', today))).toBe(403);
	});

	it('403 for an unassigned caretaker on shift', async () => {
		const ct = locals({ id: 'ct-other', role: 'caretaker' });
		expect(await statusOf(assertCanWriteJournalMedia(ct, 'comp1', today))).toBe(403);
	});

	it('403 for a caretaker on an archived companion', async () => {
		const ct = locals({ id: 'ct-on', role: 'caretaker' });
		expect(await statusOf(assertCanWriteJournalMedia(ct, 'comp-archived', today))).toBe(403);
	});
});
