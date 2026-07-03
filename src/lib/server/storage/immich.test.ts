import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { startImmichFake, makeImmichAsset, type ImmichFake } from '../../../../tests/fakes/immich';
import { createImmichClient, type ImmichClient } from './immich';

// The fake mimics Immich v3: album responses carry no assets[], search
// validates integers and honors albumIds/visibility/type. The same request
// surface exists on v2, so passing here means the client works on both.
describe('createImmichClient listAssets', () => {
	let fake: ImmichFake;
	let client: ImmichClient;
	const ALBUM_ID = 'album-1';

	beforeAll(async () => {
		fake = await startImmichFake();
		client = createImmichClient({ url: fake.url, apiKey: fake.apiKey, albumId: null });
	});
	afterAll(async () => {
		await fake.stop();
	});
	beforeEach(() => {
		fake.reset();
	});

	it('album mode returns only assets belonging to the album', async () => {
		fake.setAssets([makeImmichAsset('in-1'), makeImmichAsset('in-2'), makeImmichAsset('out-1')]);
		fake.setAlbum(ALBUM_ID, ['in-1', 'in-2']);

		const { items, hasNextPage } = await client.listAssets({
			page: 1,
			pageSize: 10,
			albumId: ALBUM_ID
		});
		expect(items.map((a) => a.id)).toEqual(['in-1', 'in-2']);
		expect(hasNextPage).toBe(false);
	});

	it('album mode paginates server-side', async () => {
		fake.setAssets([makeImmichAsset('a1'), makeImmichAsset('a2'), makeImmichAsset('a3')]);
		fake.setAlbum(ALBUM_ID, ['a1', 'a2', 'a3']);

		const page1 = await client.listAssets({ page: 1, pageSize: 2, albumId: ALBUM_ID });
		expect(page1.items.map((a) => a.id)).toEqual(['a1', 'a2']);
		expect(page1.hasNextPage).toBe(true);

		const page2 = await client.listAssets({ page: 2, pageSize: 2, albumId: ALBUM_ID });
		expect(page2.items.map((a) => a.id)).toEqual(['a3']);
		expect(page2.hasNextPage).toBe(false);
	});

	it('album mode excludes videos via the server-side type filter', async () => {
		fake.setAssets([makeImmichAsset('img'), makeImmichAsset('vid', { type: 'VIDEO' })]);
		fake.setAlbum(ALBUM_ID, ['img', 'vid']);

		const { items } = await client.listAssets({ page: 1, pageSize: 10, albumId: ALBUM_ID });
		expect(items.map((a) => a.id)).toEqual(['img']);
	});

	it('excludes archived assets in album mode despite v3 widened search defaults', async () => {
		fake.setAssets([
			makeImmichAsset('shown'),
			makeImmichAsset('hidden', { visibility: 'archive' })
		]);
		fake.setAlbum(ALBUM_ID, ['shown', 'hidden']);

		const { items } = await client.listAssets({ page: 1, pageSize: 10, albumId: ALBUM_ID });
		expect(items.map((a) => a.id)).toEqual(['shown']);
	});

	it('excludes archived assets in search mode despite v3 widened search defaults', async () => {
		fake.setAssets([
			makeImmichAsset('shown'),
			makeImmichAsset('hidden', { visibility: 'archive' })
		]);

		const { items } = await client.listAssets({ page: 1, pageSize: 10 });
		expect(items.map((a) => a.id)).toEqual(['shown']);
	});

	it('search mode paginates via Immich nextPage', async () => {
		fake.setAssets([makeImmichAsset('a1'), makeImmichAsset('a2'), makeImmichAsset('a3')]);

		const page1 = await client.listAssets({ page: 1, pageSize: 2 });
		expect(page1.items.map((a) => a.id)).toEqual(['a1', 'a2']);
		expect(page1.hasNextPage).toBe(true);

		const page2 = await client.listAssets({ page: 2, pageSize: 2 });
		expect(page2.items.map((a) => a.id)).toEqual(['a3']);
		expect(page2.hasNextPage).toBe(false);
	});
});
