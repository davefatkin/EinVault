import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest';
import { eq, sql } from 'drizzle-orm';
import { db, schema } from '$lib/server/db';

// Fake storage: records puts/deletes; a put can be made to fail.
const store = vi.hoisted(() => ({
	puts: [] as string[],
	deletes: [] as string[],
	failPut: false
}));
vi.mock('$lib/server/storage', () => {
	const backend = {
		provider: 'local',
		put: vi.fn(async ({ key }: { key: string }) => {
			if (store.failPut) throw new Error('put failed');
			store.puts.push(key);
			return { key };
		}),
		get: vi.fn(),
		delete: vi.fn(async (key: string) => {
			store.deletes.push(key);
		})
	};
	return { getStorage: vi.fn(() => backend), STORAGE_BACKEND: 'local' };
});

const {
	noteMediaKey,
	listNoteMedia,
	listMediaForNotes,
	listNoteMediaStatus,
	getNoteMediaItem,
	getNoteMediaView,
	countNoteMedia,
	insertNoteMedia,
	saveNoteMediaUpload,
	setNoteMediaCaption,
	deleteNoteMediaItem
} = await import('./note-media');

const C1 = 'c-nm-1';
const U1 = 'u-nm-1';
const N1 = 'n-nm-1';
const N2 = 'n-nm-2';

beforeAll(async () => {
	await db.insert(schema.companions).values({ id: C1, name: 'Rex' });
	await db
		.insert(schema.users)
		.values({ id: U1, username: 'nm1', displayName: 'Jet', role: 'member', passwordHash: 'x' });
});

beforeEach(async () => {
	store.puts.length = 0;
	store.deletes.length = 0;
	store.failPut = false;
	await db.delete(schema.notes);
	await db.insert(schema.notes).values([
		{ id: N1, companionId: C1, title: 'Commands' },
		{ id: N2, companionId: C1, title: 'Food' }
	]);
});

function row(id: string, noteId = N1, extra: Partial<typeof schema.noteMedia.$inferInsert> = {}) {
	return {
		id,
		noteId,
		filename: `${id}.jpg`,
		storageKey: noteMediaKey(C1, noteId, `${id}.jpg`),
		mimeType: 'image/jpeg',
		sizeBytes: 10,
		loggedBy: U1,
		...extra
	};
}

const prepared = (filename: string, willTranscode = false) => ({
	body: Buffer.from('jpeg'),
	contentType: 'image/jpeg',
	filename,
	mediaType: 'photo' as const,
	willTranscode,
	sizeBytes: 4
});

describe('note_media schema', () => {
	it('fills defaults in SQL, including created_at', async () => {
		db.run(
			sql`INSERT INTO note_media (id, note_id, filename, mime_type, size_bytes) VALUES ('m-raw', ${N1}, 'm-raw.jpg', 'image/jpeg', 1)`
		);
		const row = await db.query.noteMedia.findFirst({ where: eq(schema.noteMedia.id, 'm-raw') });
		expect(row).toMatchObject({
			provider: 'local',
			mediaType: 'photo',
			status: 'ready',
			transcodeAttempts: 0,
			caption: null
		});
		expect(row!.createdAt).toBeInstanceOf(Date);
		expect(row!.createdAt.getTime()).toBeGreaterThan(0);
	});

	it('cascades media rows when the note is deleted', async () => {
		await db.insert(schema.noteMedia).values({
			id: 'm-1',
			noteId: N1,
			filename: 'm-1.jpg',
			storageKey: `notes/${C1}/${N1}/m-1.jpg`,
			mimeType: 'image/jpeg',
			sizeBytes: 10,
			loggedBy: U1
		});
		await db.delete(schema.notes).where(eq(schema.notes.id, N1));
		expect(await db.query.noteMedia.findMany()).toEqual([]);
	});

	it('loads the note and logger relations', async () => {
		await db.insert(schema.noteMedia).values({
			id: 'm-2',
			noteId: N1,
			filename: 'm-2.jpg',
			mimeType: 'image/jpeg',
			sizeBytes: 10,
			loggedBy: U1
		});
		const row = await db.query.noteMedia.findFirst({
			where: eq(schema.noteMedia.id, 'm-2'),
			with: { note: { columns: { companionId: true } }, logger: { columns: { displayName: true } } }
		});
		expect(row?.note.companionId).toBe(C1);
		expect(row?.logger?.displayName).toBe('Jet');
	});
});

describe('noteMediaKey', () => {
	it('builds notes/{companion}/{note}/{file}', () => {
		expect(noteMediaKey('c', 'n', 'f.jpg')).toBe('notes/c/n/f.jpg');
	});
});

describe('insertNoteMedia', () => {
	it('inserts under the cap', () => {
		expect(insertNoteMedia(row('a'), 2)).toBe('ok');
		expect(insertNoteMedia(row('b'), 2)).toBe('ok');
		expect(insertNoteMedia(row('c'), 2)).toBe('cap');
	});

	it('reports a deleted note instead of failing on the foreign key', async () => {
		await db.delete(schema.notes).where(eq(schema.notes.id, N1));
		expect(insertNoteMedia(row('a'), 10)).toBe('noteGone');
		expect(await countNoteMedia(N1)).toBe(0);
	});
});

describe('saveNoteMediaUpload', () => {
	const base = { companionId: C1, noteId: N1, originalName: 'dog.jpg', loggedBy: U1, max: 10 };

	it('stores the blob, then the row', async () => {
		expect(
			await saveNoteMediaUpload({ ...base, mediaId: 'm1', prepared: prepared('m1.jpg') })
		).toBe('ok');
		expect(store.puts).toEqual([`notes/${C1}/${N1}/m1.jpg`]);
		const saved = await getNoteMediaItem(N1, 'm1');
		expect(saved).toMatchObject({
			provider: 'local',
			storageKey: `notes/${C1}/${N1}/m1.jpg`,
			originalName: 'dog.jpg',
			status: 'ready',
			loggedBy: U1
		});
	});

	it('marks a video queued for transcoding as processing', async () => {
		await saveNoteMediaUpload({ ...base, mediaId: 'v1', prepared: prepared('v1.orig.mov', true) });
		expect((await getNoteMediaItem(N1, 'v1'))?.status).toBe('processing');
	});

	it('removes the blob when the note was deleted mid-upload', async () => {
		await db.delete(schema.notes).where(eq(schema.notes.id, N1));
		expect(
			await saveNoteMediaUpload({ ...base, mediaId: 'm2', prepared: prepared('m2.jpg') })
		).toBe('noteGone');
		expect(store.deletes).toEqual([`notes/${C1}/${N1}/m2.jpg`]);
		expect(await db.query.noteMedia.findMany()).toEqual([]);
	});

	it('lets exactly one of two concurrent uploads take the last slot', async () => {
		insertNoteMedia(row('existing'), 10);
		const results = await Promise.all([
			saveNoteMediaUpload({ ...base, max: 2, mediaId: 'r1', prepared: prepared('r1.jpg') }),
			saveNoteMediaUpload({ ...base, max: 2, mediaId: 'r2', prepared: prepared('r2.jpg') })
		]);
		const loser = results[0] === 'cap' ? 'r1' : 'r2';
		expect([...results].sort()).toEqual(['cap', 'ok']);
		expect(await countNoteMedia(N1)).toBe(2);
		expect(store.deletes).toEqual([`notes/${C1}/${N1}/${loser}.jpg`]);
	});

	it('reports a failed put without inserting', async () => {
		store.failPut = true;
		const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
		expect(
			await saveNoteMediaUpload({ ...base, mediaId: 'm3', prepared: prepared('m3.jpg') })
		).toBe('putFailed');
		spy.mockRestore();
		expect(await countNoteMedia(N1)).toBe(0);
		expect(store.deletes).toEqual([]);
	});

	it('removes the blob and rethrows when the insert throws', async () => {
		insertNoteMedia(row('dup'), 10);
		await expect(
			saveNoteMediaUpload({ ...base, mediaId: 'dup', prepared: prepared('dup2.jpg') })
		).rejects.toThrow();
		expect(store.deletes).toEqual([`notes/${C1}/${N1}/dup2.jpg`]);
	});
});

describe('listing', () => {
	it('lists MediaItem fields in createdAt, id order with the logger', async () => {
		insertNoteMedia(row('b', N1, { createdAt: new Date(2_000_000), caption: 'sit' }), 10);
		insertNoteMedia(row('a', N1, { createdAt: new Date(2_000_000) }), 10);
		insertNoteMedia(row('z', N1, { createdAt: new Date(1_000_000) }), 10);
		const items = await listNoteMedia(N1);
		expect(items.map((m) => m.id)).toEqual(['z', 'a', 'b']);
		expect(Object.keys(items[0]).sort()).toEqual(
			[
				'caption',
				'filename',
				'id',
				'logger',
				'loggedBy',
				'mediaType',
				'originalName',
				'posterKey',
				'status'
			].sort()
		);
		expect(items[2]).toMatchObject({ caption: 'sit', logger: { displayName: 'Jet' } });
	});

	it('groups media by note and handles an empty id list', async () => {
		insertNoteMedia(row('a', N1), 10);
		insertNoteMedia(row('b', N2), 10);
		const map = await listMediaForNotes([N1, N2]);
		expect(map.get(N1)?.map((m) => m.id)).toEqual(['a']);
		expect(map.get(N2)?.map((m) => m.id)).toEqual(['b']);
		expect(await listMediaForNotes([])).toEqual(new Map());
	});

	it('returns status rows for the poll', async () => {
		insertNoteMedia(row('a', N1, { status: 'processing' }), 10);
		expect(await listNoteMediaStatus(N1)).toEqual([
			{ id: 'a', status: 'processing', filename: 'a.jpg', posterKey: null }
		]);
	});

	it('scopes getNoteMediaItem to the note', async () => {
		insertNoteMedia(row('a', N1), 10);
		expect(await getNoteMediaItem(N2, 'a')).toBeUndefined();
		expect((await getNoteMediaItem(N1, 'a'))?.id).toBe('a');
	});
});

describe('captions and deletes', () => {
	it('trims captions and stores blank as null', async () => {
		insertNoteMedia(row('a'), 10);
		await setNoteMediaCaption('a', '  paw  ');
		expect((await getNoteMediaItem(N1, 'a'))?.caption).toBe('paw');
		await setNoteMediaCaption('a', '   ');
		expect((await getNoteMediaItem(N1, 'a'))?.caption).toBeNull();
	});

	it('deletes the row and its objects', async () => {
		insertNoteMedia(
			row('v', N1, {
				filename: 'v.mp4',
				storageKey: `notes/${C1}/${N1}/v.mp4`,
				originalKey: `notes/${C1}/${N1}/v.orig.mov`,
				posterKey: `notes/${C1}/${N1}/v.poster.jpg`
			}),
			10
		);
		await deleteNoteMediaItem((await getNoteMediaItem(N1, 'v'))!);
		expect(await getNoteMediaItem(N1, 'v')).toBeUndefined();
		expect(store.deletes.sort()).toEqual(
			[
				`notes/${C1}/${N1}/v.mp4`,
				`notes/${C1}/${N1}/v.orig.mov`,
				`notes/${C1}/${N1}/v.poster.jpg`
			].sort()
		);
	});
});

describe('getNoteMediaView', () => {
	it('returns one MediaItem with the logger, scoped to the note', async () => {
		insertNoteMedia(row('a', N1, { caption: 'sit' }), 10);
		insertNoteMedia(row('b', N1), 10);
		const view = await getNoteMediaView(N1, 'a');
		expect(view).toEqual((await listNoteMedia(N1)).find((m) => m.id === 'a'));
		expect(view).toMatchObject({ id: 'a', caption: 'sit', logger: { displayName: 'Jet' } });
		expect(Object.keys(view!).sort()).toEqual(
			[
				'caption',
				'filename',
				'id',
				'logger',
				'loggedBy',
				'mediaType',
				'originalName',
				'posterKey',
				'status'
			].sort()
		);
		expect(await getNoteMediaView(N2, 'a')).toBeUndefined();
		expect(await getNoteMediaView(N1, 'missing')).toBeUndefined();
	});
});
