import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest';
import { eq } from 'drizzle-orm';
import { db, schema } from '#lib/server/db/index.js';

const store = vi.hoisted(() => ({
	puts: [] as string[],
	deletes: [] as string[],
	failPut: false,
	onPut: null as null | (() => Promise<void>)
}));
vi.mock('#lib/server/storage/index.js', () => {
	const backend = {
		provider: 'local',
		put: vi.fn(async ({ key }: { key: string }) => {
			if (store.failPut) throw new Error('put failed');
			store.puts.push(key);
			if (store.onPut) await store.onPut();
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
	incidentMediaKey,
	listIncidentMedia,
	listIncidentMediaStatus,
	saveIncidentMediaUpload,
	getIncidentMediaItem,
	setIncidentMediaCaption,
	deleteIncidentMediaItem
} = await import('./incident-media');

const C1 = 'c-im-1';
const U1 = 'u-im-1';
const I1 = 'i-im-1';
const I2 = 'i-im-2';
const UP1 = 'up-im-1';
const UP_OTHER = 'up-im-other';

beforeAll(async () => {
	await db.insert(schema.companions).values({ id: C1, name: 'Rex' });
	await db
		.insert(schema.users)
		.values({ id: U1, username: 'im1', displayName: 'Jet', role: 'member', passwordHash: 'x' });
});

beforeEach(async () => {
	store.puts.length = 0;
	store.deletes.length = 0;
	store.failPut = false;
	store.onPut = null;
	await db.delete(schema.healthEvents);
	const base = {
		companionId: C1,
		type: 'incident' as const,
		occurredAt: new Date(),
		severity: 'mild' as const
	};
	await db.insert(schema.healthEvents).values([
		{ id: I1, title: 'Limp', ...base },
		{ id: I2, title: 'Cough', ...base }
	]);
	await db.insert(schema.healthEventUpdates).values([
		{ id: UP1, healthEventId: I1, body: 'a', occurredAt: new Date() },
		{ id: UP_OTHER, healthEventId: I2, body: 'b', occurredAt: new Date() }
	]);
});

const prepared = (filename: string, willTranscode = false) => ({
	body: Buffer.from('jpeg'),
	contentType: 'image/jpeg',
	filename,
	mediaType: 'photo' as const,
	willTranscode,
	sizeBytes: 4
});

const save = (
	mediaId: string,
	updateId: string | null,
	over: { incidentId?: string; max?: number } = {}
) =>
	saveIncidentMediaUpload({
		companionId: C1,
		incidentId: over.incidentId ?? I1,
		updateId,
		mediaId,
		prepared: prepared(`${mediaId}.jpg`),
		originalName: 'x.jpg',
		loggedBy: U1,
		max: over.max ?? 10
	});

describe('incidentMediaKey', () => {
	it('builds health/{companion}/{incident}/{file}', () => {
		expect(incidentMediaKey('c', 'i', 'f.jpg')).toBe('health/c/i/f.jpg');
	});
});

describe('saveIncidentMediaUpload', () => {
	it('inserts an overview row with healthEventId and null updateId', async () => {
		expect(await save('m1', null)).toBe('ok');
		const row = await db.query.media.findFirst({ where: eq(schema.media.id, 'm1') });
		expect(row).toMatchObject({
			healthEventId: I1,
			updateId: null,
			storageKey: `health/${C1}/${I1}/m1.jpg`,
			status: 'ready'
		});
	});

	it('inserts an update row with both parents', async () => {
		expect(await save('m1', UP1)).toBe('ok');
		const row = await db.query.media.findFirst({ where: eq(schema.media.id, 'm1') });
		expect(row).toMatchObject({ healthEventId: I1, updateId: UP1 });
	});

	it('counts the cap per parent: a full overview does not block an update', async () => {
		for (let i = 0; i < 2; i++) expect(await save(`o${i}`, null, { max: 2 })).toBe('ok');
		expect(await save('o2', null, { max: 2 })).toBe('cap');
		expect(await save('u0', UP1, { max: 2 })).toBe('ok');
		expect(await save('u1', UP1, { max: 2 })).toBe('ok');
		expect(await save('u2', UP1, { max: 2 })).toBe('cap');
		// the overview still counts only overview rows
		expect(await save('o3', null, { max: 3 })).toBe('ok');
	});

	it('returns gone for an update of another incident and deletes the blob', async () => {
		expect(await save('m1', UP_OTHER)).toBe('gone');
		expect(store.deletes).toEqual([`health/${C1}/${I1}/m1.jpg`]);
		expect(await db.query.media.findMany()).toEqual([]);
	});

	it('returns gone for an unknown update id', async () => {
		expect(await save('m1', 'nope')).toBe('gone');
		expect(store.deletes).toHaveLength(1);
	});

	it('returns gone and deletes the blob when the incident is deleted mid-upload', async () => {
		store.onPut = async () => {
			await db.delete(schema.healthEvents).where(eq(schema.healthEvents.id, I1));
		};
		expect(await save('m1', null)).toBe('gone');
		expect(store.puts).toEqual([`health/${C1}/${I1}/m1.jpg`]);
		expect(store.deletes).toEqual([`health/${C1}/${I1}/m1.jpg`]);
	});

	it('returns putFailed without a row or delete when storage fails', async () => {
		store.failPut = true;
		expect(await save('m1', null)).toBe('putFailed');
		expect(store.deletes).toEqual([]);
		expect(await db.query.media.findMany()).toEqual([]);
	});

	it('deletes the blob for a cap rejection', async () => {
		expect(await save('m1', null, { max: 1 })).toBe('ok');
		expect(await save('m2', null, { max: 1 })).toBe('cap');
		expect(store.deletes).toEqual([`health/${C1}/${I1}/m2.jpg`]);
	});
});

describe('list, caption, delete', () => {
	it('groups media into overview and byUpdate', async () => {
		await save('o1', null);
		await save('u1', UP1);
		const { overview, byUpdate } = await listIncidentMedia(I1);
		expect(overview.map((m) => m.id)).toEqual(['o1']);
		expect(byUpdate.get(UP1)?.map((m) => m.id)).toEqual(['u1']);
		expect(byUpdate.size).toBe(1);
		expect(JSON.stringify(overview)).not.toContain('storageKey');
	});

	it('status list covers overview and update media', async () => {
		await save('o1', null);
		await save('u1', UP1);
		expect((await listIncidentMediaStatus(I1)).map((m) => m.id).sort()).toEqual(['o1', 'u1']);
	});

	it('scopes get and caption to the incident', async () => {
		await save('o1', null);
		expect(await getIncidentMediaItem(I2, 'o1')).toBeUndefined();
		await setIncidentMediaCaption(I2, 'o1', 'nope');
		await setIncidentMediaCaption(I1, 'o1', '  hi  ');
		expect((await getIncidentMediaItem(I1, 'o1'))?.caption).toBe('hi');
	});

	it('deletes the row then its blobs', async () => {
		await save('o1', null);
		const item = (await getIncidentMediaItem(I1, 'o1'))!;
		store.deletes.length = 0;
		await deleteIncidentMediaItem(item);
		expect(await getIncidentMediaItem(I1, 'o1')).toBeUndefined();
		expect(store.deletes).toEqual([`health/${C1}/${I1}/o1.jpg`]);
	});
});
