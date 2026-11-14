import { describe, it, expect, vi, beforeAll } from 'vitest';
import { eq } from 'drizzle-orm';
import { db, schema } from '#lib/server/db/index.js';

vi.mock('#lib/server/storage/index.js', async (importOriginal) => ({
	...(await importOriginal<typeof import('#lib/server/storage/index.js')>()),
	getStorage: () => ({ put: vi.fn(async () => {}), delete: vi.fn(async () => {}) }),
	STORAGE_BACKEND: 'local'
}));

const { PATCH } = await import('./+server');

const C = 'c-dp';
const MEM = { id: 'u-dp-mem', role: 'member' as const };

beforeAll(async () => {
	await db
		.insert(schema.users)
		.values({ id: MEM.id, username: 'dp-mem', displayName: 'M', role: 'member' });
	await db.insert(schema.companions).values({ id: C, name: 'Ein' });
	await db.insert(schema.healthEvents).values(
		['a', 'b', 'c'].map((k) => ({
			id: `ev-${k}`,
			companionId: C,
			type: 'incident' as const,
			// ev-c has no title to name in a 409.
			title: k === 'c' ? '' : `Visit ${k.toUpperCase()}`,
			occurredAt: new Date(),
			loggedBy: MEM.id
		}))
	);
	const doc = (id: string, healthEventId: string | null) => ({
		id,
		companionId: C,
		healthEventId,
		filename: `${id}.pdf`,
		storageKey: `${id}.pdf`,
		title: id,
		mimeType: 'application/pdf'
	});
	await db
		.insert(schema.documents)
		.values([
			doc('d-free', null),
			doc('d-on-a', 'ev-a'),
			doc('d-on-a2', 'ev-a'),
			doc('d-on-c', 'ev-c')
		]);
});

function patch(documentId: string, body: object) {
	const request = new Request('http://x/api', { method: 'PATCH', body: JSON.stringify(body) });
	return PATCH({
		params: { companionId: C, documentId },
		locals: { user: MEM, locale: 'en' },
		request
	} as never);
}

async function eventOf(id: string) {
	const row = await db.query.documents.findFirst({ where: eq(schema.documents.id, id) });
	return row?.healthEventId;
}

describe('documents PATCH onlyIfUnlinked', () => {
	it('links an unlinked document with onlyIfUnlinked', async () => {
		const res = await patch('d-free', { healthEventId: 'ev-b', onlyIfUnlinked: true });
		expect(res.status).toBe(200);
		expect(await eventOf('d-free')).toBe('ev-b');
	});

	it('is a no-op success when already on the requested event', async () => {
		const res = await patch('d-on-a', { healthEventId: 'ev-a', onlyIfUnlinked: true });
		expect(res.status).toBe(200);
		expect(await eventOf('d-on-a')).toBe('ev-a');
	});

	it('refuses with 409 when the document is on another event', async () => {
		await expect(
			patch('d-on-a', { healthEventId: 'ev-b', onlyIfUnlinked: true })
		).rejects.toMatchObject({ status: 409, body: { message: 'Already attached to Visit A' } });
		expect(await eventOf('d-on-a')).toBe('ev-a');
	});

	it('falls back to a generic 409 message when the other event has no title', async () => {
		await expect(
			patch('d-on-c', { healthEventId: 'ev-b', onlyIfUnlinked: true })
		).rejects.toMatchObject({
			status: 409,
			body: { message: 'Something went wrong. Please try again.' }
		});
		expect(await eventOf('d-on-c')).toBe('ev-c');
	});

	it('moves the document without the flag, as before', async () => {
		const res = await patch('d-on-a2', { healthEventId: 'ev-b' });
		expect(res.status).toBe(200);
		expect(await eventOf('d-on-a2')).toBe('ev-b');
	});

	it('unlinks with onlyIfUnlinked and healthEventId null, with no guard', async () => {
		const res = await patch('d-on-a', { healthEventId: null, onlyIfUnlinked: true });
		expect(res.status).toBe(200);
		expect(await eventOf('d-on-a')).toBeNull();
	});

	it('unlinks with healthEventId null', async () => {
		const res = await patch('d-on-a2', { healthEventId: null });
		expect(res.status).toBe(200);
		expect(await eventOf('d-on-a2')).toBeNull();
	});
});
