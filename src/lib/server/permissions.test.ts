import { describe, it, expect, beforeAll } from 'vitest';
import { db, schema } from '$lib/server/db';
import { localDateISO } from '$lib/date';
import { assertCanWriteJournalMedia, assertCanWriteNoteMedia } from './permissions';

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

describe('assertCanWriteNoteMedia', () => {
	beforeAll(async () => {
		await db.insert(schema.companions).values([
			{ id: 'nm-comp', name: 'NoteComp' },
			{ id: 'nm-archived', name: 'NoteOld', isActive: false },
			{ id: 'nm-other', name: 'Other' }
		] as (typeof schema.companions.$inferInsert)[]);
		await db.insert(schema.notes).values([
			{ id: 'nm-note', companionId: 'nm-comp', title: 'Cmds' },
			{ id: 'nm-note-arch', companionId: 'nm-archived', title: 'Old' }
		]);
		// ct-on (assigned + on shift from the journal block above) gets an
		// assignment here too, so the 403 comes from the role, not the assignment.
		await db.insert(schema.companionCaretakers).values({ companionId: 'nm-comp', userId: 'ct-on' });
	});

	const noteStatus = (user: { id: string; role: Role } | null, cid: string, nid: string) =>
		statusOf(assertCanWriteNoteMedia(locals(user), cid, nid).then(() => undefined));

	it('401 for anonymous', async () => {
		expect(await noteStatus(null, 'nm-comp', 'nm-note')).toBe(401);
	});

	it('403 for caretakers, even assigned and on shift', async () => {
		expect(await noteStatus({ id: 'ct-on', role: 'caretaker' }, 'nm-comp', 'nm-note')).toBe(403);
	});

	it('allows members and admins, including on archived companions', async () => {
		for (const user of [
			{ id: 'adm', role: 'admin' as const },
			{ id: 'mem', role: 'member' as const }
		]) {
			expect(await noteStatus(user, 'nm-comp', 'nm-note')).toBe('ok');
			expect(await noteStatus(user, 'nm-archived', 'nm-note-arch')).toBe('ok');
		}
	});

	it('404 when the note is missing or belongs to another companion', async () => {
		const mem = { id: 'mem', role: 'member' as const };
		expect(await noteStatus(mem, 'nm-comp', 'missing')).toBe(404);
		expect(await noteStatus(mem, 'nm-other', 'nm-note')).toBe(404);
	});

	it('returns the note', async () => {
		const res = await assertCanWriteNoteMedia(
			locals({ id: 'mem', role: 'member' }),
			'nm-comp',
			'nm-note'
		);
		expect(res.note).toEqual({ id: 'nm-note', companionId: 'nm-comp' });
	});
});
