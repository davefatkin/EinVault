import { createReadStream } from 'fs';
import { mkdir, stat, unlink, writeFile } from 'fs/promises';
import { dirname, join, normalize, resolve, sep } from 'path';
import { Readable } from 'stream';
import { DATA_DIR } from '$lib/server/paths';
import type { BlobStat, GetOptions, GetResult, PutInput, StorageBackend } from './types';

const ROOT = join(DATA_DIR, 'uploads');
const SAFE_BASE = resolve(ROOT);

function resolveKey(key: string): string {
	const full = resolve(join(ROOT, normalize(key)));
	if (full !== SAFE_BASE && !full.startsWith(SAFE_BASE + sep)) {
		throw new Error('storage: key escapes upload root');
	}
	return full;
}

// Parse a single-range `bytes=start-end` header against a known size. Returns
// inclusive start/end offsets, or null for absent/multi/malformed/unsatisfiable
// ranges (caller then serves the full object).
function parseRange(
	header: string | null | undefined,
	size: number
): { start: number; end: number } | null {
	if (!header || size === 0) return null;
	const m = /^bytes=(\d*)-(\d*)$/.exec(header.trim());
	if (!m) return null;
	const [, rawStart, rawEnd] = m;
	let start: number;
	let end: number;
	if (rawStart === '') {
		// Suffix range: last N bytes.
		if (rawEnd === '') return null;
		const suffix = Number(rawEnd);
		if (suffix <= 0) return null;
		start = Math.max(0, size - suffix);
		end = size - 1;
	} else {
		start = Number(rawStart);
		end = rawEnd === '' ? size - 1 : Number(rawEnd);
	}
	if (!Number.isInteger(start) || !Number.isInteger(end)) return null;
	if (start > end || start >= size) return null;
	if (end >= size) end = size - 1;
	return { start, end };
}

function makeStat(size: number, mtimeMs: number, mtime: Date): BlobStat {
	return {
		size,
		mtime,
		etag: `"${mtimeMs.toString(36)}-${size.toString(36)}"`
	};
}

export const LocalBackend: StorageBackend = {
	provider: 'local',

	async put({ key, body }: PutInput) {
		const full = resolveKey(key);
		await mkdir(dirname(full), { recursive: true });
		await writeFile(full, body);
		return { key };
	},

	async get(key: string, opts?: GetOptions): Promise<GetResult | null> {
		const full = resolveKey(key);
		let s: Awaited<ReturnType<typeof stat>>;
		try {
			s = await stat(full);
		} catch {
			return null;
		}
		const blobStat = makeStat(s.size, s.mtimeMs, s.mtime);
		if (opts?.ifNoneMatch && opts.ifNoneMatch === blobStat.etag) {
			return { kind: 'notModified', etag: blobStat.etag };
		}

		// Honor a single byte range (enough for <video> seeking). Multi-range and
		// unsatisfiable/malformed values fall back to a full 200 response.
		const range = parseRange(opts?.range, s.size);
		if (range) {
			return {
				kind: 'stream',
				stream: Readable.toWeb(
					createReadStream(full, { start: range.start, end: range.end })
				) as ReadableStream,
				stat: blobStat,
				range: { start: range.start, end: range.end, total: s.size }
			};
		}

		return {
			kind: 'stream',
			stream: Readable.toWeb(createReadStream(full)) as ReadableStream,
			stat: blobStat
		};
	},

	async delete(key: string): Promise<void> {
		const full = resolveKey(key);
		try {
			await unlink(full);
		} catch {
			// already gone
		}
	}
};
