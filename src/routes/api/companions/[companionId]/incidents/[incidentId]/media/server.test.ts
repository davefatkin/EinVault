import { describe, it, expect, vi, beforeAll } from 'vitest';
import { eq } from 'drizzle-orm';
import { db, schema } from '#lib/server/db/index.js';

// Storage, upload prep and the worker are not under test.
vi.mock('#lib/server/storage/index.js', async (importOriginal) => ({
	...(await importOriginal<typeof import('#lib/server/storage/index.js')>()),
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
vi.mock('#lib/server/storage/media-blobs.js', async (importOriginal) => ({
	...(await importOriginal<typeof import('#lib/server/storage/media-blobs.js')>()),
	deleteMediaBlobs: vi.fn(async () => {})
}));
vi.mock('#lib/server/video/worker.js', () => ({ kickWorker: vi.fn() }));

const { POST } = await import('./+server');

const C = 'c-ims';
const INC = 'inc-ims';
const UP = 'up-ims';
const MEM = { id: 'u-ims-mem', role: 'member' as const };
const CT = { id: 'u-ims-ct', role: 'caretaker' as const };

beforeAll(async () => {
	await db.insert(schema.users).values([
		{ id: MEM.id, username: 'ims-mem', displayName: 'M', role: 'member' },
		{ id: CT.id, username: 'ims-ct', displayName: 'C', role: 'caretaker' }
	]);
	await db.insert(schema.companions).values({ id: C, name: 'Ein' });
	await db.insert(schema.companionCaretakers).values({ companionId: C, userId: CT.id });
	await db.insert(schema.healthEvents).values({
		id: INC,
		companionId: C,
		type: 'incident',
		title: 'Limp',
		occurredAt: new Date(),
		loggedBy: MEM.id
	});
	await db.insert(schema.healthEventUpdates).values({
		id: UP,
		healthEventId: INC,
		body: 'x',
		occurredAt: new Date(),
		loggedBy: MEM.id
	});
});

function post(user: { id: string; role: string }, updateId?: string) {
	const url = new URL(`http://x/api/companions/${C}/incidents/${INC}/media`);
	if (updateId) url.searchParams.set('updateId', updateId);
	const fd = new FormData();
	fd.set('file', new File([new Uint8Array([1])], 'a.jpg', { type: 'image/jpeg' }));
	const request = new Request(url, { method: 'POST', body: fd });
	return {
		request,
		run: () =>
			POST({
				params: { companionId: C, incidentId: INC },
				locals: { user, locale: 'en' },
				request,
				url
			} as never)
	};
}

async function statusOf(p: Response | Promise<Response>): Promise<number> {
	try {
		return (await p).status;
	} catch (e) {
		return (e as { status: number }).status;
	}
}

describe('incident media POST', () => {
	it('gates before reading the body: a caretaker off shift gets 403', async () => {
		const call = post(CT);
		expect(await statusOf(call.run())).toBe(403);
		expect(call.request.bodyUsed).toBe(false);
	});

	it('an update id from the query string that is not on the incident is 404, body unread', async () => {
		const call = post(MEM, 'nope');
		expect(await statusOf(call.run())).toBe(404);
		expect(call.request.bodyUsed).toBe(false);
	});

	it('attaches to the update named in the query string', async () => {
		const res = await post(MEM, UP).run();
		expect(res.status).toBe(200);
		const { id } = (await res.json()) as { id: string };
		const row = await db.query.media.findFirst({ where: eq(schema.media.id, id) });
		expect(row).toMatchObject({ healthEventId: INC, updateId: UP, loggedBy: MEM.id });
	});

	it('without an update id it goes on the overview', async () => {
		const res = await post(MEM).run();
		const { id } = (await res.json()) as { id: string };
		const row = await db.query.media.findFirst({ where: eq(schema.media.id, id) });
		expect(row?.updateId).toBeNull();
	});
});
