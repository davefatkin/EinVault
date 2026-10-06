import { describe, it, expect, vi, beforeEach } from 'vitest';
import sharp from 'sharp';
import { t } from '$lib/i18n';

// Small caps so the size tests don't allocate 100 MB. env.ts reads
// $env/dynamic/private once at import; a live proxy plus these values set
// before the dynamic import below makes UPLOAD_MAX_MB/VIDEO_MAX_MB = 1.
process.env.UPLOAD_MAX_MB = '1';
process.env.VIDEO_MAX_MB = '1';
vi.mock('$env/dynamic/private', () => ({
	env: new Proxy({} as Record<string, string | undefined>, {
		get: (_, key: string) => process.env[key]
	})
}));

// The transcode decision depends on ffmpeg being present; control it directly.
const transcode = vi.hoisted(() => ({ available: false }));
vi.mock('$lib/server/video/transcode', () => ({
	transcodeAvailable: vi.fn(async () => transcode.available),
	demuxerForMime: (mime: string) =>
		mime === 'video/webm' ? 'matroska,webm' : mime.startsWith('video/') ? 'mov,mp4' : null
}));

const { prepareMediaUpload } = await import('./media-upload');

const MB = 1024 * 1024;

function file(bytes: Uint8Array | Buffer, name: string, type: string): File {
	return new File([new Uint8Array(bytes)], name, { type });
}

// ISO BMFF header: size, 'ftyp', brand 'isom'.
const MP4_HEAD = Buffer.from([
	0x00, 0x00, 0x00, 0x18, 0x66, 0x74, 0x79, 0x70, 0x69, 0x73, 0x6f, 0x6d
]);

async function statusAndMessage(p: Promise<unknown>): Promise<[number, string]> {
	try {
		await p;
	} catch (e) {
		const err = e as { status: number; body: { message: string } };
		return [err.status, err.body.message];
	}
	throw new Error('expected rejection');
}

beforeEach(() => {
	transcode.available = false;
});

describe('prepareMediaUpload', () => {
	it('resizes a large PNG to a JPEG of at most 1920px', async () => {
		const png = await sharp({
			create: { width: 3000, height: 2000, channels: 3, background: '#c33' }
		})
			.png()
			.toBuffer();
		const out = await prepareMediaUpload(file(png, 'big.png', 'image/png'), 'abc', 'en');
		expect(out).toMatchObject({
			filename: 'abc.jpg',
			contentType: 'image/jpeg',
			mediaType: 'photo',
			willTranscode: false
		});
		expect(out.sizeBytes).toBe(out.body.length);
		const meta = await sharp(out.body).metadata();
		expect(meta.format).toBe('jpeg');
		expect(Math.max(meta.width!, meta.height!)).toBe(1920);
	});

	it('keeps a GIF and truncates it at the terminator', async () => {
		const gif = Buffer.concat([
			Buffer.from('GIF89a', 'ascii'),
			Buffer.from([0x01, 0x02, 0x3b]),
			Buffer.from('trailing', 'ascii')
		]);
		const out = await prepareMediaUpload(file(gif, 'a.gif', 'image/gif'), 'g1', 'en');
		expect(out.filename).toBe('g1.gif');
		expect(out.contentType).toBe('image/gif');
		expect(out.body[out.body.length - 1]).toBe(0x3b);
		expect(out.body.length).toBe(9);
	});

	it('rejects a GIF without the GIF signature', async () => {
		const bad = file(Buffer.from('NOTGIFDATA'), 'a.gif', 'image/gif');
		expect(await statusAndMessage(prepareMediaUpload(bad, 'x', 'en'))).toEqual([
			400,
			t('en', 'error.invalidGifFile')
		]);
	});

	it('rejects missing, empty and unsupported files', async () => {
		expect(await statusAndMessage(prepareMediaUpload(null, 'x', 'en'))).toEqual([
			400,
			t('en', 'error.noFileProvided')
		]);
		expect(
			await statusAndMessage(
				prepareMediaUpload(file(new Uint8Array(0), 'e.png', 'image/png'), 'x', 'en')
			)
		).toEqual([400, t('en', 'error.noFileProvided')]);
		expect(
			await statusAndMessage(
				prepareMediaUpload(file(Buffer.from('hi'), 'a.txt', 'text/plain'), 'x', 'en')
			)
		).toEqual([400, t('en', 'error.invalidFileType')]);
	});

	it('rejects a video whose bytes are not a video container', async () => {
		const fake = file(Buffer.from('<html>not a video</html>'), 'v.mp4', 'video/mp4');
		expect(await statusAndMessage(prepareMediaUpload(fake, 'x', 'en'))).toEqual([
			400,
			t('en', 'error.invalidFileType')
		]);
	});

	it('enforces the image and video size limits', async () => {
		const bigImage = file(Buffer.alloc(MB + 1), 'big.jpg', 'image/jpeg');
		expect(await statusAndMessage(prepareMediaUpload(bigImage, 'x', 'en'))).toEqual([
			400,
			t('en', 'error.fileTooLarge', { max: 1 })
		]);
		const bigVideo = file(Buffer.concat([MP4_HEAD, Buffer.alloc(MB)]), 'v.mp4', 'video/mp4');
		expect(await statusAndMessage(prepareMediaUpload(bigVideo, 'x', 'en'))).toEqual([
			400,
			t('en', 'error.fileTooLarge', { max: 1 })
		]);
	});

	it('stores a video as-is when transcoding is unavailable', async () => {
		const out = await prepareMediaUpload(file(MP4_HEAD, 'v.mp4', 'video/mp4'), 'v1', 'en');
		expect(out).toMatchObject({
			filename: 'v1.mp4',
			contentType: 'video/mp4',
			mediaType: 'video',
			willTranscode: false,
			sizeBytes: MP4_HEAD.length
		});
	});

	it('uses the .orig sentinel name when the video will be transcoded', async () => {
		transcode.available = true;
		const out = await prepareMediaUpload(file(MP4_HEAD, 'v.mov', 'video/quicktime'), 'v2', 'en');
		expect(out.filename).toBe('v2.orig.mov');
		expect(out.willTranscode).toBe(true);
	});
});
