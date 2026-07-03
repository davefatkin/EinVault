import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { startImmichFake, makeImmichAsset, type ImmichFake } from './immich';

describe('immich fake', () => {
	let fake: ImmichFake;
	const auth = () => ({ 'x-api-key': fake.apiKey });

	beforeAll(async () => {
		fake = await startImmichFake();
		fake.setAssets([makeImmichAsset('a1'), makeImmichAsset('a2'), makeImmichAsset('a3')]);
	});
	afterAll(async () => {
		await fake.stop();
	});

	it('rejects a wrong api key', async () => {
		const res = await fetch(`${fake.url}/api/assets/a1`, { headers: { 'x-api-key': 'wrong' } });
		expect(res.status).toBe(401);
	});

	it('paginates search/metadata', async () => {
		const res = await fetch(`${fake.url}/api/search/metadata`, {
			method: 'POST',
			headers: { ...auth(), 'content-type': 'application/json' },
			body: JSON.stringify({ page: 1, size: 2, type: 'IMAGE', order: 'desc' })
		});
		const body = (await res.json()) as { assets: { items: unknown[]; nextPage: string | null } };
		expect(body.assets.items).toHaveLength(2);
		expect(body.assets.nextPage).toBe('2');
	});

	it('rejects non-integer page/size like v3 Zod validation', async () => {
		const res = await fetch(`${fake.url}/api/search/metadata`, {
			method: 'POST',
			headers: { ...auth(), 'content-type': 'application/json' },
			body: JSON.stringify({ page: 1.5, size: 2 })
		});
		expect(res.status).toBe(400);
	});

	it('filters search by albumIds and visibility', async () => {
		fake.setAlbum('alb-1', ['a1', 'a3']);
		const search = async (extra: object) => {
			const res = await fetch(`${fake.url}/api/search/metadata`, {
				method: 'POST',
				headers: { ...auth(), 'content-type': 'application/json' },
				body: JSON.stringify({ page: 1, size: 10, ...extra })
			});
			const body = (await res.json()) as { assets: { items: { id: string }[] } };
			return body.assets.items.map((i) => i.id);
		};
		expect(await search({ albumIds: ['alb-1'] })).toEqual(['a1', 'a3']);
		expect(await search({ albumIds: ['other'] })).toEqual([]);
		// Omitting visibility returns everything (v3 widened default);
		// visibility: 'timeline' hides the archived asset.
		fake.setAssets([makeImmichAsset('a1'), makeImmichAsset('a2', { visibility: 'archive' })]);
		expect(await search({})).toEqual(['a1', 'a2']);
		expect(await search({ visibility: 'timeline' })).toEqual(['a1']);
		fake.setAssets([makeImmichAsset('a1'), makeImmichAsset('a2'), makeImmichAsset('a3')]);
	});

	it('serves v3-shaped albums (no assets[]), single assets, and image bytes', async () => {
		const album = await fetch(`${fake.url}/api/albums/alb-1`, { headers: auth() });
		const albumBody = (await album.json()) as { id: string; assets?: unknown[] };
		expect(albumBody.id).toBe('alb-1');
		expect(albumBody.assets).toBeUndefined();

		const asset = await fetch(`${fake.url}/api/assets/a2`, { headers: auth() });
		expect(((await asset.json()) as { id: string }).id).toBe('a2');

		const thumb = await fetch(`${fake.url}/api/assets/a2/thumbnail?size=preview`, {
			headers: auth()
		});
		expect(thumb.headers.get('content-type')).toBe('image/png');
		expect((await thumb.arrayBuffer()).byteLength).toBe(fake.imageBytes.length);

		expect((await fetch(`${fake.url}/api/assets/missing`, { headers: auth() })).status).toBe(404);
	});
});
