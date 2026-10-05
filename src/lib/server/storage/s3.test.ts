import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
// Server-side markdown sanitizing loads jsdom, whose undici installs itself as
// the global fetch dispatcher. Load it here so put() runs under the same setup.
import 'isomorphic-dompurify';
import { startS3Fake, type S3Fake } from '../../../../tests/fakes/s3';
import { createS3Backend } from './s3';
import type { StorageBackend } from './types';

describe('createS3Backend put', () => {
	let fake: S3Fake;
	let backend: StorageBackend;

	beforeAll(async () => {
		fake = await startS3Fake();
		backend = createS3Backend({
			endpoint: fake.url,
			bucket: fake.bucket,
			region: 'auto',
			accessKeyId: 'test',
			secretAccessKey: 'test',
			forcePathStyle: true,
			presignTtlSeconds: 300
		});
	});
	afterAll(async () => {
		await fake.stop();
	});

	it('uploads the body to the bucket', async () => {
		const body = Buffer.from('hello');
		await backend.put({ key: 'journal/a b.txt', body, contentType: 'text/plain' });
		const stored = fake.objects.get('journal/a b.txt');
		expect(stored?.body.equals(body)).toBe(true);
		expect(stored?.contentType).toBe('text/plain');
	});

	it('leaves Content-Length to fetch', async () => {
		// A hand-set Content-Length is rejected by the undici dispatcher on some
		// Node versions ("invalid content-length header").
		const spy = vi.spyOn(globalThis, 'fetch');
		try {
			await backend.put({ key: 'k', body: Buffer.from('x'), contentType: 'text/plain' });
			const request = spy.mock.calls[0][0] as Request;
			expect(request.headers.has('content-length')).toBe(false);
		} finally {
			spy.mockRestore();
		}
	});
});
