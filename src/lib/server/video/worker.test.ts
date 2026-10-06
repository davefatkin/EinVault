import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest';
import { rm } from 'node:fs/promises';
import { eq } from 'drizzle-orm';
import type { StorageBackend } from '$lib/server/storage';

// In-memory object store standing in for every storage provider.
const store = vi.hoisted(() => new Map<string, Buffer>());
const gets = vi.hoisted(() => [] as string[]);
const ctl = vi.hoisted(() => ({
	fail: false,
	duringTranscode: null as null | (() => Promise<void>),
	transcodeCalls: 0
}));
const cfg = vi.hoisted(() => ({
	enabled: true,
	keepOriginal: true,
	maxMb: 100,
	maxSeconds: 600,
	maxWidth: 4096,
	maxHeight: 4096,
	ffmpegPath: '/nonexistent/ffmpeg',
	ffprobePath: '/nonexistent/ffprobe',
	tmpDir: `${process.env.TMPDIR ?? '/tmp'}/einvault-worker-test-${process.pid}`
}));

vi.mock('$lib/server/env', async (importOriginal) => ({
	...(await importOriginal<typeof import('$lib/server/env')>()),
	VIDEO_TRANSCODE: cfg
}));

vi.mock('$lib/server/storage', () => {
	const backend = {
		provider: 'local',
		async put({ key, body }: { key: string; body: Buffer }) {
			store.set(key, body);
			return { key };
		},
		async get(key: string) {
			gets.push(key);
			const b = store.get(key);
			if (!b) return null;
			return {
				kind: 'stream',
				stream: new Blob([new Uint8Array(b)]).stream(),
				stat: { size: b.length, etag: '"x"', mtime: new Date(0) }
			};
		},
		async delete(key: string) {
			store.delete(key);
		}
	};
	return { getStorage: () => backend as unknown as StorageBackend };
});

vi.mock('./transcode', async () => {
	const { writeFile } = await import('node:fs/promises');
	const { join } = await import('node:path');
	return {
		transcodeAvailable: async () => true,
		transcodeToWebProfile: async (_src: string, jobDir: string) => {
			ctl.transcodeCalls++;
			if (ctl.duringTranscode) await ctl.duringTranscode();
			if (ctl.fail) throw new Error('ffmpeg exploded');
			const mp4Path = join(jobDir, 'out.mp4');
			const posterPath = join(jobDir, 'poster.jpg');
			await writeFile(mp4Path, Buffer.from('MP4BYTES'));
			await writeFile(posterPath, Buffer.from('JPG'));
			return { mp4Path, posterPath, meta: {} };
		}
	};
});

const { db, schema } = await import('$lib/server/db');
const { drain, journalQueue, noteQueue, __resetWorkerForTests } = await import('./worker');

const C = 'c-vw';
const ENTRY = 'e-vw';
const NOTE = 'n-vw';
const DATE = '2026-02-03';
const jKey = (f: string) => `journal/${C}/${DATE}/${f}`;
const nKey = (f: string) => `notes/${C}/${NOTE}/${f}`;

async function addJournalVideo(id: string, createdAtSec: number, attempts = 0) {
	const key = jKey(`${id}.orig.mov`);
	store.set(key, Buffer.from('SRC'));
	await db.insert(schema.journalPhotos).values({
		id,
		entryId: ENTRY,
		filename: `${id}.orig.mov`,
		provider: 'local',
		storageKey: key,
		mediaType: 'video',
		mimeType: 'video/quicktime',
		sizeBytes: 3,
		status: 'processing',
		transcodeAttempts: attempts,
		createdAt: new Date(createdAtSec * 1000)
	});
	return key;
}

async function addNoteVideo(id: string, createdAtSec: number) {
	const key = nKey(`${id}.orig.mov`);
	store.set(key, Buffer.from('SRC'));
	await db.insert(schema.noteMedia).values({
		id,
		noteId: NOTE,
		filename: `${id}.orig.mov`,
		provider: 'local',
		storageKey: key,
		mediaType: 'video',
		mimeType: 'video/quicktime',
		sizeBytes: 3,
		status: 'processing',
		createdAt: new Date(createdAtSec * 1000)
	});
	return key;
}

beforeAll(async () => {
	await db.insert(schema.companions).values({ id: C, name: 'Vid' });
	await db.insert(schema.journalEntries).values({ id: ENTRY, companionId: C, date: DATE });
});

afterAll(async () => {
	await rm(cfg.tmpDir, { recursive: true, force: true });
});

beforeEach(async () => {
	__resetWorkerForTests();
	store.clear();
	gets.length = 0;
	ctl.fail = false;
	ctl.duringTranscode = null;
	ctl.transcodeCalls = 0;
	cfg.keepOriginal = true;
	await db.delete(schema.journalPhotos);
	await db.delete(schema.notes);
	await db.insert(schema.notes).values({ id: NOTE, companionId: C, title: 'Tricks' });
	vi.spyOn(console, 'info').mockImplementation(() => {});
	vi.spyOn(console, 'warn').mockImplementation(() => {});
	vi.spyOn(console, 'error').mockImplementation(() => {});
});

describe('video worker', () => {
	it('drains both tables oldest first', async () => {
		const journalSrc = await addJournalVideo('jv-new', 2000);
		const noteSrc = await addNoteVideo('nv-old', 1000);
		await drain();
		expect(gets).toEqual([noteSrc, journalSrc]);
		const j = await db.query.journalPhotos.findFirst({
			where: eq(schema.journalPhotos.id, 'jv-new')
		});
		const n = await db.query.noteMedia.findFirst({ where: eq(schema.noteMedia.id, 'nv-old') });
		expect(j?.status).toBe('ready');
		expect(n?.status).toBe('ready');
	});

	it('rewrites a note row on success and keeps the original when configured', async () => {
		const src = await addNoteVideo('nv-ok', 1000);
		await drain();
		const n = await db.query.noteMedia.findFirst({ where: eq(schema.noteMedia.id, 'nv-ok') });
		expect(n).toMatchObject({
			status: 'ready',
			filename: 'nv-ok.mp4',
			storageKey: nKey('nv-ok.mp4'),
			posterKey: nKey('nv-ok.poster.jpg'),
			originalKey: src,
			mimeType: 'video/mp4',
			sizeBytes: Buffer.from('MP4BYTES').length,
			transcodeAttempts: 1
		});
		expect(store.has(nKey('nv-ok.mp4'))).toBe(true);
		expect(store.has(nKey('nv-ok.poster.jpg'))).toBe(true);
		expect(store.has(src)).toBe(true);
	});

	it('drops the original when keepOriginal is off', async () => {
		cfg.keepOriginal = false;
		const src = await addJournalVideo('jv-drop', 1000);
		await drain();
		const j = await db.query.journalPhotos.findFirst({
			where: eq(schema.journalPhotos.id, 'jv-drop')
		});
		expect(j?.originalKey).toBeNull();
		expect(store.has(src)).toBe(false);
		expect(store.has(jKey('jv-drop.mp4'))).toBe(true);
	});

	it('marks a failed transcode failed and leaves no outputs', async () => {
		ctl.fail = true;
		const src = await addNoteVideo('nv-fail', 1000);
		await drain();
		const n = await db.query.noteMedia.findFirst({ where: eq(schema.noteMedia.id, 'nv-fail') });
		expect(n).toMatchObject({ status: 'failed', storageKey: src, transcodeAttempts: 1 });
		expect(store.has(nKey('nv-fail.mp4'))).toBe(false);
		expect(store.has(nKey('nv-fail.poster.jpg'))).toBe(false);
		expect(store.has(src)).toBe(true);
	});

	it('fails a job that has exhausted its attempts without transcoding it', async () => {
		await addJournalVideo('jv-tired', 1000, 3);
		await drain();
		const j = await db.query.journalPhotos.findFirst({
			where: eq(schema.journalPhotos.id, 'jv-tired')
		});
		expect(j).toMatchObject({ status: 'failed', transcodeAttempts: 4 });
		expect(ctl.transcodeCalls).toBe(0);
	});

	it('cleans up outputs and the source when the row is deleted mid-job', async () => {
		const src = await addNoteVideo('nv-gone', 1000);
		ctl.duringTranscode = async () => {
			await db.delete(schema.notes).where(eq(schema.notes.id, NOTE));
		};
		await drain();
		expect(
			await db.query.noteMedia.findFirst({ where: eq(schema.noteMedia.id, 'nv-gone') })
		).toBeUndefined();
		expect(store.has(nKey('nv-gone.mp4'))).toBe(false);
		expect(store.has(nKey('nv-gone.poster.jpg'))).toBe(false);
		expect(store.has(src)).toBe(false);
	});

	it('keeps the source of a row reset mid-job and leaves no outputs', async () => {
		const src = await addNoteVideo('nv-reset', 1000);
		ctl.duringTranscode = async () => {
			await noteQueue.resetClaimed();
			ctl.duringTranscode = null;
			ctl.fail = true; // stop the retry from completing
		};
		await drain();
		expect(store.has(src)).toBe(true);
		expect(store.has(nKey('nv-reset.mp4'))).toBe(false);
		expect(store.has(nKey('nv-reset.poster.jpg'))).toBe(false);
		expect(
			await db.query.noteMedia.findFirst({ where: eq(schema.noteMedia.id, 'nv-reset') })
		).toBeDefined();
	});

	it('resets claimed rows to processing on boot for both tables', async () => {
		await addJournalVideo('jv-claimed', 1000);
		await addNoteVideo('nv-claimed', 1000);
		await db.update(schema.journalPhotos).set({ status: 'claimed' });
		await db.update(schema.noteMedia).set({ status: 'claimed' });
		expect(await journalQueue.resetClaimed()).toBe(1);
		expect(await noteQueue.resetClaimed()).toBe(1);
		const j = await db.query.journalPhotos.findFirst({
			where: eq(schema.journalPhotos.id, 'jv-claimed')
		});
		const n = await db.query.noteMedia.findFirst({ where: eq(schema.noteMedia.id, 'nv-claimed') });
		expect(j?.status).toBe('processing');
		expect(n?.status).toBe('processing');
	});

	it('markReady reports false for a row that is no longer claimed', async () => {
		await addNoteVideo('nv-race', 1000);
		const ok = await noteQueue.markReady('nv-race', {
			filename: 'x.mp4',
			storageKey: nKey('x.mp4'),
			posterKey: nKey('x.poster.jpg'),
			originalKey: null,
			mimeType: 'video/mp4',
			sizeBytes: 1
		});
		expect(ok).toBe(false);
		const n = await db.query.noteMedia.findFirst({ where: eq(schema.noteMedia.id, 'nv-race') });
		expect(n?.status).toBe('processing');
	});
});
