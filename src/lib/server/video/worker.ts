// Background video transcode worker (issue #86). A single in-process loop that
// drains queued transcode jobs (journal_photos rows with status='processing'),
// converts the source to a web-playable MP4 + poster via the hardened ffmpeg
// wrapper, and updates the row. No external job queue — this fits the app's
// single-process adapter-node + SQLite model.
//
// State machine (journal_photos.status):
//   processing -> claimed -> ready          (success)
//   processing -> claimed -> failed         (error, or attempts exhausted)
//
// A 'processing'/'failed' row is a fully valid RAW-video row: filename/storageKey
// point at the original upload exactly as a pre-#86 video. Only on success does
// the worker repoint the row at the transcoded MP4. So a failed transcode simply
// degrades to the original "stored as-is" behavior — the UI's existing
// can't-play fallback still works.
//
// Crash safety: a job is atomically claimed (status -> 'claimed', attempt
// counter incremented) before any async work. On boot, recover() resets orphaned
// 'claimed' rows back to 'processing'; the per-claim attempt cap turns a crashing
// poison input into a terminal 'failed' after a few boots rather than an infinite
// requeue. Leftover temp dirs are purged on boot.

import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { and, asc, eq, sql } from 'drizzle-orm';
import { db, schema } from '$lib/server/db';
import { getStorage } from '$lib/server/storage';
import { videoExtFromMime } from '$lib/server/storage/mime';
import { VIDEO_TRANSCODE } from '$lib/server/env';
import type { StorageProvider } from '$lib/server/storage/types';
import { transcodeAvailable, transcodeToWebProfile } from './transcode';

// Give up after this many attempts. The counter increments on each atomic claim,
// so a job that crashes the process mid-transcode is retried on the next boot up
// to this cap, then marked 'failed' instead of requeued forever.
const MAX_ATTEMPTS = 3;

// Prefix for per-job temp directories under VIDEO_TRANSCODE.tmpDir. Used both to
// create job dirs and to identify orphans to purge on boot.
const TMP_PREFIX = 'einvault-';

// Only one loop runs at a time in this process. kick() is a no-op while a drain
// is already in flight; the in-flight loop picks up anything newly enqueued.
let draining = false;

async function ensureTmpBase(): Promise<void> {
	await mkdir(VIDEO_TRANSCODE.tmpDir, { recursive: true });
}

/** Read a web ReadableStream fully into a Buffer. */
async function streamToBuffer(stream: ReadableStream): Promise<Buffer> {
	const reader = stream.getReader();
	const chunks: Buffer[] = [];
	for (;;) {
		const { done, value } = await reader.read();
		if (done) break;
		chunks.push(Buffer.from(value as Uint8Array));
	}
	return Buffer.concat(chunks);
}

/**
 * Fetch the bytes of a stored object regardless of backend: local returns a
 * stream, S3 returns a presigned redirect URL we then fetch.
 */
async function downloadObject(provider: StorageProvider, key: string): Promise<Buffer> {
	const res = await getStorage(provider).get(key);
	if (!res) throw new Error(`source object missing: ${key}`);
	if (res.kind === 'stream') return streamToBuffer(res.stream);
	if (res.kind === 'redirect') {
		const r = await fetch(res.url);
		if (!r.ok) throw new Error(`source fetch failed (${r.status})`);
		return Buffer.from(await r.arrayBuffer());
	}
	throw new Error(`unexpected get result: ${res.kind}`);
}

interface ClaimedJob {
	id: string;
	storageKey: string;
	provider: StorageProvider;
	mimeType: string;
	attempts: number;
}

/**
 * Atomically claim the oldest queued job. Selects the oldest 'processing' row,
 * then transitions it to 'claimed' guarded on its still being 'processing'
 * (incrementing the attempt counter). Returns null when the queue is empty or
 * the candidate was claimed by a racing writer (caller loops again).
 */
async function claimNext(): Promise<ClaimedJob | null> {
	const [candidate] = await db
		.select({
			id: schema.journalPhotos.id,
			storageKey: schema.journalPhotos.storageKey,
			provider: schema.journalPhotos.provider,
			mimeType: schema.journalPhotos.mimeType
		})
		.from(schema.journalPhotos)
		.where(eq(schema.journalPhotos.status, 'processing'))
		.orderBy(asc(schema.journalPhotos.createdAt))
		.limit(1);

	if (!candidate) return null;

	const claimed = await db
		.update(schema.journalPhotos)
		.set({
			status: 'claimed',
			transcodeAttempts: sql`${schema.journalPhotos.transcodeAttempts} + 1`
		})
		.where(
			and(eq(schema.journalPhotos.id, candidate.id), eq(schema.journalPhotos.status, 'processing'))
		)
		.returning({
			id: schema.journalPhotos.id,
			storageKey: schema.journalPhotos.storageKey,
			provider: schema.journalPhotos.provider,
			mimeType: schema.journalPhotos.mimeType,
			attempts: schema.journalPhotos.transcodeAttempts
		});

	if (claimed.length === 0) return null; // lost the race; try again

	const row = claimed[0];
	if (!row.storageKey) {
		// A video row always has a storage key; if not, it cannot be transcoded.
		await markFailed(row.id);
		return null;
	}
	return {
		id: row.id,
		storageKey: row.storageKey,
		provider: row.provider,
		mimeType: row.mimeType,
		attempts: row.attempts
	};
}

async function markFailed(id: string): Promise<void> {
	// Leave filename/storageKey untouched: the row remains a valid raw-video row
	// pointing at the original upload, so the UI's can't-play fallback works.
	await db
		.update(schema.journalPhotos)
		.set({ status: 'failed' })
		.where(eq(schema.journalPhotos.id, id));
}

/** Process one claimed job end to end. Throws on any failure. */
async function processJob(job: ClaimedJob): Promise<void> {
	const backend = getStorage(job.provider);
	const sourceKey = job.storageKey;
	const dir = sourceKey.slice(0, sourceKey.lastIndexOf('/'));
	const mp4Filename = `${job.id}.mp4`;
	const posterFilename = `${job.id}.poster.jpg`;
	const mp4Key = `${dir}/${mp4Filename}`;
	const posterKey = `${dir}/${posterFilename}`;

	await ensureTmpBase();
	const jobDir = await mkdtemp(join(VIDEO_TRANSCODE.tmpDir, TMP_PREFIX));
	try {
		// Download source -> temp file (ffmpeg reads the file, not a buffer).
		const srcBuf = await downloadObject(job.provider, sourceKey);
		const srcPath = join(jobDir, `source.${videoExtFromMime(job.mimeType)}`);
		await writeFile(srcPath, srcBuf);

		// Transcode (probe + cap-check happen inside).
		const { mp4Path, posterPath } = await transcodeToWebProfile(srcPath, jobDir, job.mimeType);
		const mp4Buf = await readFile(mp4Path);
		const posterBuf = await readFile(posterPath);

		// Upload outputs BEFORE repointing the row, so a crash here leaves the row
		// pointing at the still-present original (it gets retried).
		await backend.put({ key: mp4Key, body: mp4Buf, contentType: 'video/mp4' });
		await backend.put({ key: posterKey, body: posterBuf, contentType: 'image/jpeg' });

		const keepOriginal = VIDEO_TRANSCODE.keepOriginal;
		await db
			.update(schema.journalPhotos)
			.set({
				filename: mp4Filename,
				storageKey: mp4Key,
				posterKey,
				originalKey: keepOriginal ? sourceKey : null,
				mimeType: 'video/mp4',
				sizeBytes: mp4Buf.length,
				status: 'ready'
			})
			.where(eq(schema.journalPhotos.id, job.id));

		// Discard the source only after the row no longer references it.
		if (!keepOriginal) {
			await backend.delete(sourceKey).catch((err) => {
				console.warn(`[video] failed to delete original ${sourceKey}:`, err);
			});
		}
	} finally {
		await rm(jobDir, { recursive: true, force: true }).catch(() => {});
	}
}

/** Drain the queue until empty. Single-flight via the `draining` guard. */
async function drain(): Promise<void> {
	if (draining) return;
	draining = true;
	try {
		for (;;) {
			const job = await claimNext();
			if (!job) break;
			if (job.attempts > MAX_ATTEMPTS) {
				console.warn(`[video] job ${job.id} exhausted ${MAX_ATTEMPTS} attempts, marking failed`);
				await markFailed(job.id);
				continue;
			}
			try {
				await processJob(job);
				console.info(`[video] transcoded ${job.id}`);
			} catch (err) {
				console.error(`[video] transcode failed for ${job.id} (attempt ${job.attempts}):`, err);
				await markFailed(job.id);
			}
		}
	} finally {
		draining = false;
	}
}

/**
 * Enqueue-side trigger: kick the drain loop. Safe to call after every upload;
 * a no-op if a drain is already running or the feature is unavailable. Fire and
 * forget — errors are logged, never thrown to the caller.
 */
export function kickWorker(): void {
	transcodeAvailable()
		.then((ok) => {
			if (ok) return drain();
		})
		.catch((err) => console.error('[video] worker drain error:', err));
}

/**
 * Remove orphaned per-job temp dirs left by a crash/SIGKILL. Best-effort.
 */
async function purgeOrphanTempDirs(): Promise<void> {
	let entries: string[];
	try {
		entries = await readdir(VIDEO_TRANSCODE.tmpDir);
	} catch {
		return; // dir doesn't exist yet — nothing to purge
	}
	await Promise.all(
		entries
			.filter((name) => name.startsWith(TMP_PREFIX))
			.map((name) =>
				rm(join(VIDEO_TRANSCODE.tmpDir, name), { recursive: true, force: true }).catch(() => {})
			)
	);
}

/**
 * Boot-time recovery. Resets jobs orphaned mid-transcode by a crash ('claimed'
 * back to 'processing'; the per-attempt cap caps total retries), purges leftover
 * temp dirs, then kicks the worker to drain anything pending. No-op when
 * transcoding is unavailable. Fire and forget.
 */
export function recoverAndStart(): void {
	transcodeAvailable()
		.then(async (ok) => {
			if (!ok) return;
			const reset = await db
				.update(schema.journalPhotos)
				.set({ status: 'processing' })
				.where(eq(schema.journalPhotos.status, 'claimed'))
				.returning({ id: schema.journalPhotos.id });
			if (reset.length > 0) {
				console.info(`[video] recovered ${reset.length} interrupted transcode job(s)`);
			}
			await purgeOrphanTempDirs();
			await drain();
		})
		.catch((err) => console.error('[video] worker recovery error:', err));
}
