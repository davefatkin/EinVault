import { describe, it, expect, vi, beforeAll } from 'vitest';
import { and, eq } from 'drizzle-orm';
import { db, schema } from '#lib/server/db/index.js';

// Storage, upload prep and the worker are not under test.
vi.mock('#lib/server/storage/index.js', async (importOriginal) => ({
	...(await importOriginal<typeof import('#lib/server/storage/index.js')>()),
	getImmichClient: () => ({
		getAsset: async () => ({
			originalMimeType: 'image/jpeg',
			originalFileName: 'x.jpg',
			fileSizeInByte: 1
		})
	}),
	getStorage: () => ({ put: vi.fn(async () => {}), delete: vi.fn(async () => {}) }),
	STORAGE_BACKEND: 'local'
}));
vi.mock('#lib/server/storage/media-upload.js', () => ({
	prepareMediaUpload: vi.fn(async (_file: unknown, mediaId: string) => ({
		body: Buffer.from('x'),
		contentType: 'image/jpeg',
		filename: `${mediaId}.jpg`,
		mediaType: 'photo',
		willTranscode: false,
		sizeBytes: 1
	}))
}));
vi.mock('#lib/server/storage/media-blobs.js', () => ({ deleteMediaBlobs: vi.fn(async () => {}) }));
vi.mock('#lib/server/video/worker.js', () => ({ kickWorker: vi.fn() }));

const { POST, PATCH, DELETE } = await import('./+server');
const { POST: POST_IMMICH } = await import('./from-immich/+server');

const C = 'c-jps';
const DATE = '2026-05-01';
const USER = { id: 'u-jps', role: 'admin' as const };

beforeAll(async () => {
	await db
		.insert(schema.users)
		.values({ id: USER.id, username: 'jps', displayName: 'J', role: 'admin' });
	await db.insert(schema.companions).values({ id: C, name: 'Ein' });
	await db.insert(schema.notes).values({ id: 'n-jps', companionId: C, title: 'T' });
	await db.insert(schema.media).values({
		id: 'nm-jps',
		noteId: 'n-jps',
		filename: 'nm-jps.jpg',
		mimeType: 'image/jpeg',
		sizeBytes: 1,
		caption: 'keep me',
		loggedBy: USER.id
	});
});

function event(method: string, opts: { photoId?: string; body?: FormData; json?: unknown } = {}) {
	const url = new URL(`http://x/api/companions/${C}/journal/${DATE}/photos`);
	if (opts.photoId) url.searchParams.set('photoId', opts.photoId);
	const body = opts.json !== undefined ? JSON.stringify(opts.json) : opts.body;
	const request = new Request(url, { method, body });
	return {
		params: { companionId: C, date: DATE },
		locals: { user: USER, locale: 'en' },
		request,
		url
	} as never;
}

async function statusOf(p: Response | Promise<Response>): Promise<number> {
	try {
		return (await p).status;
	} catch (e) {
		return (e as { status: number }).status;
	}
}

describe('journal photos endpoint on the media table', () => {
	it('POST returns the media item without storage keys', async () => {
		const fd = new FormData();
		fd.set('photo', new File([new Uint8Array([1])], 'a.jpg', { type: 'image/jpeg' }));
		const res = await POST(event('POST', { body: fd }));
		const body = await res.json();
		expect(body).toMatchObject({ caption: null, mediaType: 'photo' });
		expect(body.url).toMatch(new RegExp(`^/api/photos/journal/${C}/${DATE}/`));
		expect(body).not.toHaveProperty('storageKey');
		expect(body).not.toHaveProperty('originalKey');
		expect(body).not.toHaveProperty('provider');
		const row = await db.query.media.findFirst({ where: eq(schema.media.id, body.id) });
		expect(row?.entryId).not.toBeNull();
		expect(row?.noteId).toBeNull();
	});

	it('PATCH and DELETE 404 for a note media id', async () => {
		expect(
			await statusOf(PATCH(event('PATCH', { photoId: 'nm-jps', json: { notes: 'hijack' } })))
		).toBe(404);
		expect(await statusOf(DELETE(event('DELETE', { photoId: 'nm-jps' })))).toBe(404);
		const row = await db.query.media.findFirst({ where: eq(schema.media.id, 'nm-jps') });
		expect(row?.caption).toBe('keep me');
	});

	it('PATCH and DELETE 404 for journal media under a different date', async () => {
		await db
			.insert(schema.journalEntries)
			.values({ id: 'je-jps', companionId: C, date: DATE })
			.onConflictDoNothing();
		const entry = await db.query.journalEntries.findFirst({
			where: and(eq(schema.journalEntries.companionId, C), eq(schema.journalEntries.date, DATE))
		});
		await db.insert(schema.media).values({
			id: 'jm-jps',
			entryId: entry!.id,
			filename: 'jm-jps.jpg',
			storageKey: null,
			mimeType: 'image/jpeg',
			sizeBytes: 1,
			caption: 'keep me too',
			loggedBy: USER.id
		});
		const other = (method: string, opts: Parameters<typeof event>[1]) => {
			const e = event(method, opts) as unknown as { params: { date: string } };
			e.params.date = '2026-05-02';
			return e as never;
		};
		expect(
			await statusOf(PATCH(other('PATCH', { photoId: 'jm-jps', json: { notes: 'hijack' } })))
		).toBe(404);
		expect(await statusOf(DELETE(other('DELETE', { photoId: 'jm-jps' })))).toBe(404);
		const row = await db.query.media.findFirst({ where: eq(schema.media.id, 'jm-jps') });
		expect(row?.caption).toBe('keep me too');
	});

	it('from-immich POST returns the media item without storage keys', async () => {
		const assetId = '123e4567-e89b-12d3-a456-426614174000';
		const e = event('POST', { json: { assetId } }) as unknown as { params: object };
		const res = await POST_IMMICH(e as never);
		const body = await res.json();
		expect(body).toMatchObject({ mediaType: 'photo' });
		expect(body).not.toHaveProperty('storageKey');
		expect(body).not.toHaveProperty('originalKey');
		expect(body).not.toHaveProperty('provider');
		const row = await db.query.media.findFirst({ where: eq(schema.media.id, body.id) });
		expect(row?.entryId).not.toBeNull();
		expect(row?.provider).toBe('immich');
	});

	it('PATCH writes the body notes field to caption', async () => {
		const fd = new FormData();
		fd.set('photo', new File([new Uint8Array([1])], 'b.jpg', { type: 'image/jpeg' }));
		const { id } = await (await POST(event('POST', { body: fd }))).json();
		await PATCH(event('PATCH', { photoId: id, json: { notes: '  ears up ' } }));
		const row = await db.query.media.findFirst({ where: eq(schema.media.id, id) });
		expect(row?.caption).toBe('ears up');
	});
});
