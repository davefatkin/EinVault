import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { eq } from 'drizzle-orm';
import { db, schema } from '$lib/server/db';
import {
	listNotes,
	getNote,
	createNote,
	updateNote,
	setPinned,
	deleteNote,
	listTags,
	listSharedNotes,
	sharedNotesMarkdown
} from './notes';
import type { NewNote } from '$lib/notes';

const C1 = 'c-notes-1';
const C2 = 'c-notes-2';
const U1 = 'u-notes-1';
const U2 = 'u-notes-2';

function note(partial: Partial<NewNote> & { title: string }): NewNote {
	return { body: '', tags: [], pinned: false, sharedWithCaretakers: false, ...partial };
}

async function setUpdatedAt(id: string, seconds: number) {
	await db
		.update(schema.notes)
		.set({ updatedAt: new Date(seconds * 1000) })
		.where(eq(schema.notes.id, id));
}

beforeAll(async () => {
	await db.insert(schema.companions).values([
		{ id: C1, name: 'Rex' },
		{ id: C2, name: 'Bo' }
	]);
	await db.insert(schema.users).values([
		{ id: U1, username: 'n1', displayName: 'Jet', role: 'member', passwordHash: 'x' },
		{ id: U2, username: 'n2', displayName: 'Spike', role: 'admin', passwordHash: 'x' }
	]);
});

beforeEach(async () => {
	await db.delete(schema.notes);
});

describe('createNote / getNote', () => {
	it('stores the note, its tags, and both attribution fields', async () => {
		const id = await createNote(C1, note({ title: 'Commands', tags: ['training', 'tricks'] }), U1);
		const got = await getNote(id);
		expect(got).toMatchObject({
			id,
			companionId: C1,
			title: 'Commands',
			tags: ['training', 'tricks'],
			loggedBy: U1,
			updatedBy: U1,
			logger: { displayName: 'Jet' }
		});
	});

	it('round-trips non-ASCII text', async () => {
		const id = await createNote(C1, note({ title: 'Comandos básicos', tags: ['犬のごはん'] }), U1);
		expect(await getNote(id)).toMatchObject({ title: 'Comandos básicos', tags: ['犬のごはん'] });
	});

	it('scopes by companion when asked', async () => {
		const id = await createNote(C1, note({ title: 'A' }), U1);
		expect(await getNote(id, C2)).toBeNull();
		expect(await getNote(id, C1)).not.toBeNull();
		expect(await getNote('missing')).toBeNull();
	});
});

describe('updateNote', () => {
	it('diffs tags and bumps the edit fields', async () => {
		const id = await createNote(C1, note({ title: 'A', tags: ['a', 'b'] }), U1);
		await setUpdatedAt(id, 1_000);
		expect(await updateNote(id, { title: 'B', tags: ['b', 'c'] }, U2)).toBe(true);
		const got = await getNote(id);
		expect(got?.title).toBe('B');
		expect(got?.tags).toEqual(['b', 'c']);
		expect(got?.updatedBy).toBe(U2);
		expect(got?.loggedBy).toBe(U1);
		expect(got!.updatedAt.getTime()).toBeGreaterThan(1_000_000);
	});

	it('can clear all tags', async () => {
		const id = await createNote(C1, note({ title: 'A', tags: ['a'] }), U1);
		await updateNote(id, { tags: [] }, U1);
		expect((await getNote(id))?.tags).toEqual([]);
	});

	it('is a no-op for an empty patch', async () => {
		const id = await createNote(C1, note({ title: 'A' }), U1);
		await setUpdatedAt(id, 1_000);
		expect(await updateNote(id, {}, U2)).toBe(true);
		const got = await getNote(id);
		expect(got?.updatedBy).toBe(U1);
		expect(got!.updatedAt.getTime()).toBe(1_000_000);
	});

	it('returns false for a missing note', async () => {
		expect(await updateNote('missing', { title: 'x' }, U1)).toBe(false);
	});
});

describe('setPinned', () => {
	it('changes pinned without counting as an edit', async () => {
		const id = await createNote(C1, note({ title: 'A' }), U1);
		await setUpdatedAt(id, 1_000);
		expect(await setPinned(id, true)).toBe(true);
		const got = await getNote(id);
		expect(got?.pinned).toBe(true);
		expect(got?.updatedBy).toBe(U1);
		expect(got!.updatedAt.getTime()).toBe(1_000_000);
	});
	it('returns false for a missing note', async () => {
		expect(await setPinned('missing', true)).toBe(false);
	});
});

describe('deleteNote', () => {
	it('deletes the note and its tags', async () => {
		const id = await createNote(C1, note({ title: 'A', tags: ['gone'] }), U1);
		expect(await deleteNote(id)).toBe(true);
		expect(await getNote(id)).toBeNull();
		expect(await listTags()).toEqual([]);
		expect(await deleteNote(id)).toBe(false);
	});
});

describe('listNotes', () => {
	it('orders pinned first, then newest update, then id', async () => {
		const a = await createNote(C1, note({ title: 'old' }), U1);
		const b = await createNote(C1, note({ title: 'new' }), U1);
		const c = await createNote(C1, note({ title: 'pinned', pinned: true }), U1);
		await setUpdatedAt(a, 1_000);
		await setUpdatedAt(b, 2_000);
		await setUpdatedAt(c, 500);
		expect((await listNotes(C1)).map((n) => n.title)).toEqual(['pinned', 'new', 'old']);
	});

	it('filters by tag and pinned, and paginates', async () => {
		await createNote(C1, note({ title: 'food', tags: ['food'] }), U1);
		await createNote(C1, note({ title: 'walk', tags: ['walks'], pinned: true }), U1);
		await createNote(C2, note({ title: 'other', tags: ['food'] }), U1);
		expect((await listNotes(C1, { tag: 'food' })).map((n) => n.title)).toEqual(['food']);
		expect((await listNotes(C1, { pinned: true })).map((n) => n.title)).toEqual(['walk']);
		expect(await listNotes(C1, { limit: 1, offset: 1 })).toHaveLength(1);
	});
});

describe('listTags', () => {
	it('counts tags per companion or across the instance', async () => {
		await createNote(C1, note({ title: 'a', tags: ['food', 'walks'] }), U1);
		await createNote(C2, note({ title: 'b', tags: ['food'] }), U1);
		expect(await listTags(C1)).toEqual([
			{ tag: 'food', count: 1 },
			{ tag: 'walks', count: 1 }
		]);
		expect(await listTags()).toEqual([
			{ tag: 'food', count: 2 },
			{ tag: 'walks', count: 1 }
		]);
	});
});

describe('shared notes', () => {
	it('lists only shared notes and renders the alias markdown', async () => {
		const a = await createNote(
			C1,
			note({ title: 'Feeding', body: 'Twice a day.', sharedWithCaretakers: true }),
			U1
		);
		const b = await createNote(
			C1,
			note({
				title: 'Doors',
				body: 'Keep the gate shut.',
				sharedWithCaretakers: true,
				pinned: true
			}),
			U1
		);
		await createNote(C1, note({ title: 'Private', body: 'secret' }), U1);
		await setUpdatedAt(a, 2_000);
		await setUpdatedAt(b, 1_000);

		expect((await listSharedNotes(C1)).map((n) => n.title)).toEqual(['Doors', 'Feeding']);

		const md = await sharedNotesMarkdown([C1, C2]);
		expect(md.get(C1)).toBe('## Doors\n\nKeep the gate shut.\n\n## Feeding\n\nTwice a day.');
		expect(md.has(C2)).toBe(false);
		expect(await sharedNotesMarkdown([])).toEqual(new Map());
	});
});
