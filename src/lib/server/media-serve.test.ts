import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { GetResult, StorageBackend } from '$lib/server/storage';

const backend = vi.hoisted(() => ({
	get: vi.fn<(key: string, opts?: unknown) => Promise<unknown>>(),
	provider: 'local'
}));

vi.mock('$lib/server/storage', () => ({
	getStorage: () => backend as unknown as StorageBackend
}));

const { serveStoredMedia } = await import('./media-serve');

function streamResult(extra: Partial<Extract<GetResult, { kind: 'stream' }>> = {}): GetResult {
	return {
		kind: 'stream',
		stream: new Blob([Buffer.from('abcdef')]).stream(),
		stat: { size: 6, etag: '"e1"', mtime: new Date(0) },
		...extra
	};
}

const local = {
	provider: 'local',
	key: 'journal/c/2026-01-01/a.jpg',
	mimeType: 'image/jpeg',
	isPoster: false
} as const;

async function statusOf(p: Promise<unknown>): Promise<number | 'ok'> {
	try {
		await p;
		return 'ok';
	} catch (e) {
		return (e as { status: number }).status;
	}
}

beforeEach(() => {
	backend.get.mockReset();
});

describe('serveStoredMedia', () => {
	it('passes If-None-Match and Range to the backend', async () => {
		backend.get.mockResolvedValue(streamResult());
		const req = new Request('http://x/', {
			headers: { 'if-none-match': '"e0"', range: 'bytes=0-1' }
		});
		await serveStoredMedia(local, req, 'en');
		expect(backend.get).toHaveBeenCalledWith(local.key, {
			ifNoneMatch: '"e0"',
			range: 'bytes=0-1'
		});
	});

	it('returns 304 with the ETag when not modified', async () => {
		backend.get.mockResolvedValue({ kind: 'notModified', etag: '"e1"' });
		const res = await serveStoredMedia(local, new Request('http://x/'), 'en');
		expect(res.status).toBe(304);
		expect(res.headers.get('etag')).toBe('"e1"');
	});

	it('redirects with private caching and no referrer', async () => {
		backend.get.mockResolvedValue({ kind: 'redirect', url: 'https://s3/x?sig', cacheSeconds: 60 });
		const res = await serveStoredMedia(
			{ ...local, provider: 's3' },
			new Request('http://x/'),
			'en'
		);
		expect(res.status).toBe(302);
		expect(res.headers.get('location')).toBe('https://s3/x?sig');
		expect(res.headers.get('cache-control')).toBe('private, max-age=60');
		expect(res.headers.get('referrer-policy')).toBe('no-referrer');
	});

	it('streams local objects as immutable with length and nosniff', async () => {
		backend.get.mockResolvedValue(streamResult());
		const res = await serveStoredMedia(local, new Request('http://x/'), 'en');
		expect(res.status).toBe(200);
		expect(res.headers.get('content-type')).toBe('image/jpeg');
		expect(res.headers.get('cache-control')).toBe('private, max-age=31536000, immutable');
		expect(res.headers.get('etag')).toBe('"e1"');
		expect(res.headers.get('x-content-type-options')).toBe('nosniff');
		expect(res.headers.get('accept-ranges')).toBe('bytes');
		expect(res.headers.get('content-length')).toBe('6');
	});

	it('gives Immich derivatives a short max-age', async () => {
		backend.get.mockResolvedValue(streamResult());
		const res = await serveStoredMedia(
			{ ...local, provider: 'immich' },
			new Request('http://x/'),
			'en'
		);
		expect(res.headers.get('cache-control')).toBe('private, max-age=300');
	});

	it('returns 206 with Content-Range for a satisfied range', async () => {
		backend.get.mockResolvedValue(streamResult({ range: { start: 0, end: 1, total: 6 } }));
		const res = await serveStoredMedia(local, new Request('http://x/'), 'en');
		expect(res.status).toBe(206);
		expect(res.headers.get('content-range')).toBe('bytes 0-1/6');
		expect(res.headers.get('content-length')).toBe('2');
	});

	it('maps a missing object to 404, an escaping key to 403 and other errors to 502', async () => {
		backend.get.mockResolvedValue(null);
		expect(await statusOf(serveStoredMedia(local, new Request('http://x/'), 'en'))).toBe(404);
		backend.get.mockRejectedValue(new Error('storage: key escapes upload root'));
		expect(await statusOf(serveStoredMedia(local, new Request('http://x/'), 'en'))).toBe(403);
		const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
		backend.get.mockRejectedValue(new Error('boom'));
		expect(await statusOf(serveStoredMedia(local, new Request('http://x/'), 'en'))).toBe(502);
		spy.mockRestore();
	});
});
