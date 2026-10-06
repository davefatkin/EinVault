import { describe, it, expect, vi, afterEach } from 'vitest';
import { journalMediaApi, noteMediaApi } from './mediaApi';
import type { MediaItem } from './media';

type Call = [string, Parameters<typeof fetch>[1]];

function stubFetch(body: unknown, status = 200) {
	const fetchMock = vi.fn(async () =>
		status === 204
			? new Response(null, { status })
			: new Response(typeof body === 'string' ? body : JSON.stringify(body), {
					status,
					headers: { 'Content-Type': 'application/json' }
				})
	);
	vi.stubGlobal('fetch', fetchMock);
	return fetchMock;
}

function call(fetchMock: ReturnType<typeof stubFetch>, i = 0): Call {
	return fetchMock.mock.calls[i] as unknown as Call;
}

const journalRow = {
	id: 'p1',
	filename: 'p1.jpg',
	originalName: 'dog.png',
	mediaType: 'photo',
	notes: 'a caption',
	status: 'ready',
	posterKey: null,
	loggedBy: 'u1',
	logger: { displayName: 'Jet' },
	storageKey: 'journal/c1/2026-06-01/p1.jpg',
	provider: 'local'
};

const noteItem: MediaItem & { url: string } = {
	id: 'm1',
	filename: 'm1.jpg',
	originalName: 'cat.png',
	mediaType: 'photo',
	caption: null,
	status: 'ready',
	posterKey: null,
	loggedBy: 'u1',
	logger: { displayName: 'Jet' },
	url: '/api/photos/notes/c1/n1/m1.jpg'
};

afterEach(() => {
	vi.unstubAllGlobals();
});

describe('journalMediaApi', () => {
	const api = journalMediaApi('c1', '2026-06-01', 'en');

	it('uploads with the photo field and maps notes to caption', async () => {
		const fetchMock = stubFetch(journalRow);
		const file = new File(['x'], 'dog.png', { type: 'image/png' });
		const item = await api.upload(file);
		const [url, init] = call(fetchMock);
		expect(url).toBe('/api/companions/c1/journal/2026-06-01/photos');
		expect(init?.method).toBe('POST');
		expect((init?.body as FormData).get('photo')).toBeInstanceOf(File);
		expect(item).toEqual({
			id: 'p1',
			filename: 'p1.jpg',
			originalName: 'dog.png',
			mediaType: 'photo',
			caption: 'a caption',
			status: 'ready',
			posterKey: null,
			loggedBy: 'u1',
			logger: { displayName: 'Jet' }
		});
		expect(item).not.toHaveProperty('storageKey');
	});

	it('sends captions as notes with photoId', async () => {
		const fetchMock = stubFetch({ success: true });
		await api.setCaption('p1', 'hello');
		const [url, init] = call(fetchMock);
		expect(url).toBe('/api/companions/c1/journal/2026-06-01/photos?photoId=p1');
		expect(init?.method).toBe('PATCH');
		expect(JSON.parse(String(init?.body))).toEqual({ notes: 'hello' });
	});

	it('deletes by photoId', async () => {
		const fetchMock = stubFetch({ success: true });
		await api.remove('p1');
		const [url, init] = call(fetchMock);
		expect(url).toBe('/api/companions/c1/journal/2026-06-01/photos?photoId=p1');
		expect(init?.method).toBe('DELETE');
	});

	it('imports from Immich', async () => {
		const fetchMock = stubFetch({ ...journalRow, notes: null });
		const item = await api.importImmich('11111111-1111-4111-8111-111111111111');
		const [url, init] = call(fetchMock);
		expect(url).toBe('/api/companions/c1/journal/2026-06-01/photos/from-immich');
		expect(JSON.parse(String(init?.body))).toEqual({
			assetId: '11111111-1111-4111-8111-111111111111'
		});
		expect(item.caption).toBeNull();
	});

	it('reads the status poll from photos', async () => {
		stubFetch({
			photos: [
				{
					id: 'p1',
					status: 'ready',
					filename: 'p1.mp4',
					mimeType: 'video/mp4',
					posterKey: 'k.jpg'
				}
			]
		});
		expect(await api.status()).toEqual([
			{ id: 'p1', status: 'ready', filename: 'p1.mp4', posterKey: 'k.jpg' }
		]);
	});

	it('throws the server message on failure', async () => {
		stubFetch({ message: 'Maximum 5 photos or videos per day' }, 400);
		const file = new File(['x'], 'dog.png', { type: 'image/png' });
		await expect(api.upload(file)).rejects.toThrow('Maximum 5 photos or videos per day');
	});

	it('falls back to the localized message when the body is not JSON', async () => {
		stubFetch('<html>bad gateway</html>', 502);
		const file = new File(['x'], 'dog.png', { type: 'image/png' });
		await expect(api.upload(file)).rejects.toThrow('Upload failed. Please try again.');
	});

	it('falls back to the localized message on a network error', async () => {
		vi.stubGlobal(
			'fetch',
			vi.fn(async () => {
				throw new TypeError('network');
			})
		);
		const file = new File(['x'], 'dog.png', { type: 'image/png' });
		await expect(api.upload(file)).rejects.toThrow('Upload failed. Please try again.');
	});

	it('builds journal URLs and the per-day cap message', () => {
		expect(api.urlFor({ ...noteItem, filename: 'p1.jpg' })).toBe(
			'/api/photos/journal/c1/2026-06-01/p1.jpg'
		);
		expect(api.capMessage(5)).toBe('Maximum 5 photos or videos per day');
	});
});

describe('noteMediaApi', () => {
	const api = noteMediaApi('c1', 'n1', 'en');

	it('uploads with the file field and drops the url', async () => {
		const fetchMock = stubFetch(noteItem);
		const item = await api.upload(new File(['x'], 'cat.png', { type: 'image/png' }));
		const [url, init] = call(fetchMock);
		expect(url).toBe('/api/companions/c1/notes/n1/media');
		expect((init?.body as FormData).get('file')).toBeInstanceOf(File);
		expect(item).not.toHaveProperty('url');
		expect(item.id).toBe('m1');
	});

	it('sends captions as caption with mediaId', async () => {
		const fetchMock = stubFetch('', 204);
		await api.setCaption('m1', 'sit');
		const [url, init] = call(fetchMock);
		expect(url).toBe('/api/companions/c1/notes/n1/media?mediaId=m1');
		expect(init?.method).toBe('PATCH');
		expect(JSON.parse(String(init?.body))).toEqual({ caption: 'sit' });
	});

	it('deletes by mediaId and accepts 204', async () => {
		const fetchMock = stubFetch('', 204);
		await api.remove('m1');
		expect(call(fetchMock)[0]).toBe('/api/companions/c1/notes/n1/media?mediaId=m1');
	});

	it('imports from Immich under the media path', async () => {
		const fetchMock = stubFetch(noteItem);
		await api.importImmich('11111111-1111-4111-8111-111111111111');
		expect(call(fetchMock)[0]).toBe('/api/companions/c1/notes/n1/media/from-immich');
	});

	it('reads the status poll from media', async () => {
		stubFetch({
			media: [{ id: 'm1', status: 'processing', filename: 'm1.orig.mov', posterKey: null }]
		});
		expect(await api.status()).toEqual([
			{ id: 'm1', status: 'processing', filename: 'm1.orig.mov', posterKey: null }
		]);
	});

	it('builds note URLs and the per-note cap message', () => {
		expect(api.urlFor(noteItem)).toBe('/api/photos/notes/c1/n1/m1.jpg');
		expect(api.capMessage(10)).toBe('Maximum 10 photos or videos per note');
	});
});
