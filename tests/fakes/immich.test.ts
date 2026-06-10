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

	it('serves album contents, single assets, and image bytes', async () => {
		const album = await fetch(`${fake.url}/api/albums/alb-1`, { headers: auth() });
		expect(((await album.json()) as { assets: unknown[] }).assets).toHaveLength(3);

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
