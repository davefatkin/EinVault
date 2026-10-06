import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest';
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

// Note deletion hands the note's media objects to deleteMediaBlobs; record the
// call instead of touching real storage.
vi.mock('$lib/server/storage/media-blobs', () => ({
	deleteMediaBlobs: vi.fn(async () => {})
}));
const { deleteMediaBlobs } = await import('$lib/server/storage/media-blobs');

async function addMedia(
	noteId: string,
	id: string,
	extra: Partial<typeof schema.noteMedia.$inferInsert> = {}
) {
	await db.insert(schema.noteMedia).values({
		id,
		noteId,
		filename: `${id}.jpg`,
		storageKey: `notes/${C1}/${noteId}/${id}.jpg`,
		mimeType: 'image/jpeg',
		sizeBytes: 1,
		loggedBy: U1,
		...extra
	});
}

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
	beforeEach(() => vi.mocked(deleteMediaBlobs).mockClear());

	it('deletes the note and its tags', async () => {
		const id = await createNote(C1, note({ title: 'A', tags: ['gone'] }), U1);
		expect(await deleteNote(id)).toBe(true);
		expect(await getNote(id)).toBeNull();
		expect(await listTags()).toEqual([]);
		expect(await deleteNote(id)).toBe(false);
		expect(deleteMediaBlobs).not.toHaveBeenCalled();
	});

	it('removes media rows and hands every stored object to deleteMediaBlobs', async () => {
		const id = await createNote(C1, note({ title: 'A' }), U1);
		await addMedia(id, 'p1');
		await addMedia(id, 'v1', {
			filename: 'v1.mp4',
			storageKey: `notes/${C1}/${id}/v1.mp4`,
			originalKey: `notes/${C1}/${id}/v1.orig.mov`,
			posterKey: `notes/${C1}/${id}/v1.poster.jpg`,
			mediaType: 'video',
			mimeType: 'video/mp4'
		});
		await addMedia(id, 'i1', { provider: 'immich', storageKey: 'immich:abc' });

		expect(await deleteNote(id)).toBe(true);
		expect(await db.query.noteMedia.findMany()).toEqual([]);
		expect(deleteMediaBlobs).toHaveBeenCalledTimes(1);
		const [rows, tag] = vi.mocked(deleteMediaBlobs).mock.calls[0];
		expect(tag).toBe('note-media');
		expect(rows).toEqual(
			expect.arrayContaining([
				{
					provider: 'local',
					storageKey: `notes/${C1}/${id}/p1.jpg`,
					originalKey: null,
					posterKey: null
				},
				{
					provider: 'local',
					storageKey: `notes/${C1}/${id}/v1.mp4`,
					originalKey: `notes/${C1}/${id}/v1.orig.mov`,
					posterKey: `notes/${C1}/${id}/v1.poster.jpg`
				},
				{ provider: 'immich', storageKey: 'immich:abc', originalKey: null, posterKey: null }
			])
		);
		expect(rows).toHaveLength(3);
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

	it('attaches mediaCount, 0 when a note has no media', async () => {
		const bare = await createNote(C1, note({ title: 'bare' }), U1);
		const full = await createNote(C1, note({ title: 'full' }), U1);
		await addMedia(full, 'm-a');
		await addMedia(full, 'm-b');
		const byTitle = new Map((await listNotes(C1)).map((n) => [n.title, n.mediaCount]));
		expect(byTitle.get('bare')).toBe(0);
		expect(byTitle.get('full')).toBe(2);
		expect(bare).toBeTruthy();
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

	it('attaches each shared note media in display order, MediaItem fields only', async () => {
		const shared = await createNote(C1, note({ title: 'S', sharedWithCaretakers: true }), U1);
		const other = await createNote(C1, note({ title: 'T', sharedWithCaretakers: true }), U1);
		const priv = await createNote(C1, note({ title: 'P' }), U1);
		await addMedia(shared, 'm-b', { createdAt: new Date(2_000_000) });
		await addMedia(shared, 'm-a', { createdAt: new Date(1_000_000), caption: 'sit' });
		await addMedia(priv, 'm-p');

		const list = await listSharedNotes(C1);
		const s = list.find((n) => n.id === shared)!;
		expect(s.media.map((m) => m.id)).toEqual(['m-a', 'm-b']);
		expect(s.media[0]).toMatchObject({ caption: 'sit', logger: { displayName: 'Jet' } });
		expect(s.media[0]).not.toHaveProperty('storageKey');
		expect(s.media[0]).not.toHaveProperty('provider');
		expect(list.find((n) => n.id === other)!.media).toEqual([]);
		expect(list.some((n) => n.id === priv)).toBe(false);
	});
});
