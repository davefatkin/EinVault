import { createReadStream } from 'fs';
import { mkdir, stat, unlink, writeFile } from 'fs/promises';
import { dirname, join, normalize, resolve } from 'path';
import { Readable } from 'stream';
import { DATA_DIR } from '$lib/server/paths';
import type { BlobStat, GetOptions, GetResult, PutInput, StorageBackend } from './types';

const ROOT = join(DATA_DIR, 'uploads');
const SAFE_BASE = resolve(ROOT);

function resolveKey(key: string): string {
	const full = resolve(join(ROOT, normalize(key)));
	if (!full.startsWith(SAFE_BASE + '/') && full !== SAFE_BASE) {
		throw new Error('storage: key escapes upload root');
	}
	return full;
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
