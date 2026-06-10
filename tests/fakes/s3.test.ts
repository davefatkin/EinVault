import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { startS3Fake, type S3Fake } from './s3';

describe('s3 fake', () => {
	let fake: S3Fake;
	let base: string;
	beforeAll(async () => {
		fake = await startS3Fake();
		base = `${fake.url}/${fake.bucket}`;
	});
	afterAll(async () => {
		await fake.stop();
	});

	it('PUT stores, GET serves with content-type', async () => {
		const put = await fetch(`${base}/photos/a%20b.jpg`, {
			method: 'PUT',
			headers: { 'content-type': 'image/jpeg' },
			body: new Uint8Array(Buffer.from('jpegbytes'))
		});
		expect(put.ok).toBe(true);
		expect(fake.objects.has('photos/a b.jpg')).toBe(true);

		const get = await fetch(`${base}/photos/a%20b.jpg?X-Amz-Expires=300&X-Amz-Signature=ignored`);
		expect(get.status).toBe(200);
		expect(get.headers.get('content-type')).toBe('image/jpeg');
		expect(await get.text()).toBe('jpegbytes');
	});

	it('serves single-range 206 responses', async () => {
		await fetch(`${base}/video.mp4`, {
			method: 'PUT',
			body: new Uint8Array(Buffer.from('0123456789'))
		});
		const part = await fetch(`${base}/video.mp4`, { headers: { range: 'bytes=2-5' } });
		expect(part.status).toBe(206);
		expect(part.headers.get('content-range')).toBe('bytes 2-5/10');
		expect(await part.text()).toBe('2345');

		const tail = await fetch(`${base}/video.mp4`, { headers: { range: 'bytes=8-' } });
		expect(tail.status).toBe(206);
		expect(await tail.text()).toBe('89');

		const bad = await fetch(`${base}/video.mp4`, { headers: { range: 'bytes=99-' } });
		expect(bad.status).toBe(416);
	});

	it('GET 404s on missing keys, DELETE is idempotent', async () => {
		expect((await fetch(`${base}/nope`)).status).toBe(404);
		expect((await fetch(`${base}/nope`, { method: 'DELETE' })).status).toBe(204);
	});

	it('404s outside the bucket', async () => {
		expect((await fetch(`${fake.url}/other-bucket/key`)).status).toBe(404);
	});
});
