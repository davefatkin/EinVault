// Background video transcode worker (issue #86). A single in-process loop that
// drains queued transcode jobs (media rows with status='processing' in
// journal_photos and note_media), converts the source to a web-playable MP4 +
// poster via the hardened ffmpeg wrapper, and updates the row. No external job
// queue: this fits the app's single-process adapter-node + SQLite model.
//
// Each media table is reached through a MediaQueue adapter; the loop claims the
// oldest processing row across all queues.
//
// State machine (row.status):
//   processing -> claimed -> ready          (success)
//   processing -> claimed -> failed         (error, or attempts exhausted)
//
// A 'processing'/'failed' row is a fully valid RAW-video row: filename/storageKey
// point at the original upload exactly as a pre-#86 video. Only on success does
// the worker repoint the row at the transcoded MP4. So a failed transcode simply
// degrades to the original "stored as-is" behavior and the UI's can't-play
// fallback still works.
//
// Crash safety: a job is atomically claimed (status -> 'claimed', attempt
// counter incremented) before any async work. On boot, recoverAndStart() resets
// orphaned 'claimed' rows back to 'processing'; the per-claim attempt cap turns a
// crashing poison input into a terminal 'failed' after a few boots rather than
// an infinite requeue. Leftover temp dirs are purged on boot.
//
// Deletion during a job: if the row is gone (its note or item was deleted) when
// the transcode finishes, markReady matches nothing and the worker deletes the
// outputs and the source so nothing is left behind.

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

/**
 * Read a web ReadableStream into a Buffer, aborting if it exceeds `maxBytes`.
 * The whole object is held in memory, so this cap (the transcode size limit)
 * bounds peak RAM and stops an out-of-band-grown or oversized object — e.g. a
 * pre-existing row reprocessed on boot — from OOMing the worker.
 */
async function streamToBuffer(stream: ReadableStream, maxBytes: number): Promise<Buffer> {
	const reader = stream.getReader();
	const chunks: Buffer[] = [];
	let total = 0;
	for (;;) {
		const { done, value } = await reader.read();
		if (done) break;
		total += (value as Uint8Array).byteLength;
		if (total > maxBytes) {
			await reader.cancel().catch(() => {});
			throw new Error(`source exceeds ${maxBytes}-byte transcode cap`);
		}
		chunks.push(Buffer.from(value as Uint8Array));
	}
	return Buffer.concat(chunks);
}

/**
 * Fetch the bytes of a stored object regardless of backend: local returns a
 * stream, S3 returns a presigned redirect URL we then fetch. Both paths enforce
 * the source size cap.
 */
async function downloadObject(provider: StorageProvider, key: string): Promise<Buffer> {
	const maxBytes = VIDEO_TRANSCODE.maxMb * 1024 * 1024;
	const res = await getStorage(provider).get(key);
	if (!res) throw new Error(`source object missing: ${key}`);
	if (res.kind === 'stream') return streamToBuffer(res.stream, maxBytes);
	if (res.kind === 'redirect') {
		const r = await fetch(res.url);
		if (!r.ok) throw new Error(`source fetch failed (${r.status})`);
		// Reject early on an advertised over-cap length; still stream-cap below
		// since Content-Length can be absent or wrong.
		const len = Number(r.headers.get('content-length'));
		if (Number.isFinite(len) && len > maxBytes) {
			throw new Error(`source exceeds ${maxBytes}-byte transcode cap (${len})`);
		}
		if (!r.body) return Buffer.from(await r.arrayBuffer());
		return streamToBuffer(r.body, maxBytes);
	}
	throw new Error(`unexpected get result: ${res.kind}`);
}

export type ClaimRow = {
	id: string;
	storageKey: string | null;
	provider: StorageProvider;
	mimeType: string;
	attempts: number;
};

export type ReadyUpdate = {
	filename: string;
	storageKey: string;
	posterKey: string;
	originalKey: string | null;
	mimeType: string;
	sizeBytes: number;
};

export type MediaQueue = {
	name: 'journal' | 'note';
	oldestProcessing(): Promise<{ id: string; createdAt: Date } | undefined>;
	// processing -> claimed, attempts + 1. Undefined when another writer won.
	claim(id: string): Promise<ClaimRow | undefined>;
	markFailed(id: string): Promise<void>;
	// Guarded on status = 'claimed'. False when the row is gone or was reset.
	markReady(id: string, update: ReadyUpdate): Promise<boolean>;
	// Boot recovery: claimed -> processing. Returns the number of rows reset.
	resetClaimed(): Promise<number>;
};

interface ClaimedJob {
	id: string;
	storageKey: string;
	provider: StorageProvider;
	mimeType: string;
	attempts: number;
	queue: MediaQueue;
}

// Both media tables share every column the worker touches (same names and
// types), so one factory serves both. note_media is passed through a cast to
// the journal table type; the worker never reads a column outside that set.
type QueueTable = typeof schema.journalPhotos;

function createQueue(name: MediaQueue['name'], table: QueueTable): MediaQueue {
	return {
		name,
		async oldestProcessing() {
			const [row] = await db
				.select({ id: table.id, createdAt: table.createdAt })
				.from(table)
				.where(eq(table.status, 'processing'))
				.orderBy(asc(table.createdAt), asc(table.id))
				.limit(1);
			return row;
		},
		async claim(id) {
			const [row] = await db
				.update(table)
				.set({ status: 'claimed', transcodeAttempts: sql`${table.transcodeAttempts} + 1` })
				.where(and(eq(table.id, id), eq(table.status, 'processing')))
				.returning({
					id: table.id,
					storageKey: table.storageKey,
					provider: table.provider,
					mimeType: table.mimeType,
					attempts: table.transcodeAttempts
				});
			return row;
		},
		async markFailed(id) {
			// Leave filename/storageKey untouched: the row remains a valid raw-video
			// row pointing at the original upload, so the UI's can't-play fallback works.
			await db.update(table).set({ status: 'failed' }).where(eq(table.id, id));
		},
		async markReady(id, update) {
			const rows = await db
				.update(table)
				.set({ ...update, status: 'ready' })
				.where(and(eq(table.id, id), eq(table.status, 'claimed')))
				.returning({ id: table.id });
			return rows.length > 0;
		},
		async resetClaimed() {
			const rows = await db
				.update(table)
				.set({ status: 'processing' })
				.where(eq(table.status, 'claimed'))
				.returning({ id: table.id });
			return rows.length;
		}
	};
}

export const journalQueue = createQueue('journal', schema.journalPhotos);
export const noteQueue = createQueue('note', schema.noteMedia as unknown as QueueTable);

const QUEUES: MediaQueue[] = [journalQueue, noteQueue];

/**
 * Atomically claim the oldest claimable job across all queues. Picks the
 * queue whose oldest 'processing' row is oldest (journal wins ties), then
 * claims it guarded on its still being 'processing'. Loops past candidates
 * lost to a racing writer or unclaimable (no storage key) so a single skip
 * never ends the drain; returns null only when every queue is empty.
 */
async function claimNext(): Promise<ClaimedJob | null> {
	for (;;) {
		let pick: { queue: MediaQueue; id: string; createdAt: Date } | null = null;
		for (const queue of QUEUES) {
			const head = await queue.oldestProcessing();
			if (head && (!pick || head.createdAt.getTime() < pick.createdAt.getTime())) {
				pick = { queue, ...head };
			}
		}
		if (!pick) return null; // every queue empty

		const row = await pick.queue.claim(pick.id);
		if (!row) continue; // lost the race; pick the next candidate

		if (!row.storageKey) {
			// A video row always has a storage key; if not, it cannot be
			// transcoded. Fail it and keep draining the rest of the queue.
			await pick.queue.markFailed(row.id);
			continue;
		}
		return { ...row, storageKey: row.storageKey, queue: pick.queue };
	}
}

/**
 * Deterministic output object keys for a job, derived from the source key's
 * directory. The names depend only on the (server-generated) row id, so every
 * attempt targets the same keys — re-runs overwrite rather than orphan.
 */
function outputKeys(job: ClaimedJob): { mp4Filename: string; mp4Key: string; posterKey: string } {
	const slash = job.storageKey.lastIndexOf('/');
	if (slash < 0) throw new Error(`malformed storage key (no path separator): ${job.storageKey}`);
	const dir = job.storageKey.slice(0, slash);
	const mp4Filename = `${job.id}.mp4`;
	return {
		mp4Filename,
		mp4Key: `${dir}/${mp4Filename}`,
		posterKey: `${dir}/${job.id}.poster.jpg`
	};
}

/**
 * Best-effort removal of a job's transcode outputs. Called when a job ends
 * 'failed': the row stays pointing at its original source, so any MP4/poster a
 * prior attempt uploaded before crashing is unreferenced and must be cleaned up.
 */
async function cleanupOutputs(job: ClaimedJob): Promise<void> {
	let keys: ReturnType<typeof outputKeys>;
	try {
		keys = outputKeys(job);
	} catch {
		return;
	}
	const backend = getStorage(job.provider);
	await Promise.allSettled([backend.delete(keys.mp4Key), backend.delete(keys.posterKey)]);
}

/** Process one claimed job end to end. Throws on any failure. */
async function processJob(job: ClaimedJob): Promise<void> {
	const backend = getStorage(job.provider);
	const sourceKey = job.storageKey;
	const { mp4Filename, mp4Key, posterKey } = outputKeys(job);

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
		const updated = await job.queue.markReady(job.id, {
			filename: mp4Filename,
			storageKey: mp4Key,
			posterKey,
			originalKey: keepOriginal ? sourceKey : null,
			mimeType: 'video/mp4',
			sizeBytes: mp4Buf.length
		});

		if (!updated) {
			// The row was deleted while we transcoded (its note or the item went
			// away). Nothing references the outputs or the source any more.
			console.info(`[video] ${job.queue.name} media ${job.id} was deleted mid-job, cleaning up`);
			await cleanupOutputs(job);
			await backend.delete(sourceKey).catch((err) => {
				console.warn(`[video] failed to delete original ${sourceKey}:`, err);
			});
			return;
		}

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

/** Drain the queues until empty. Single-flight via the `draining` guard. */
export async function drain(): Promise<void> {
	if (draining) return;
	draining = true;
	try {
		for (;;) {
			const job = await claimNext();
			if (!job) break;
			if (job.attempts > MAX_ATTEMPTS) {
				console.warn(`[video] job ${job.id} exhausted ${MAX_ATTEMPTS} attempts, marking failed`);
				await job.queue.markFailed(job.id);
				await cleanupOutputs(job);
				continue;
			}
			try {
				await processJob(job);
				console.info(`[video] transcoded ${job.queue.name} media ${job.id}`);
			} catch (err) {
				console.error(`[video] transcode failed for ${job.id} (attempt ${job.attempts}):`, err);
				await job.queue.markFailed(job.id);
				await cleanupOutputs(job);
			}
		}
	} finally {
		draining = false;
	}
}

/** Test hook: clear the single-flight guard between cases. */
export function __resetWorkerForTests(): void {
	draining = false;
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
			let reset = 0;
			for (const queue of QUEUES) reset += await queue.resetClaimed();
			if (reset > 0) {
				console.info(`[video] recovered ${reset} interrupted transcode job(s)`);
			}
			await purgeOrphanTempDirs();
			await drain();
		})
		.catch((err) => console.error('[video] worker recovery error:', err));
}
