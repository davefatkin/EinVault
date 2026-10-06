import { getStorage } from '$lib/server/storage';

// Stored objects owned by one media row (journal or note). Immich rows point
// at the user's library and are never deleted.
export type StoredMediaRef = {
	provider: 'local' | 's3' | 'immich';
	storageKey: string | null;
	originalKey: string | null;
	posterKey: string | null;
};

// Best-effort delete of every object the rows own: the primary file plus, for
// a transcoded video, the kept original and the poster. Each row uses its own
// provider's backend (rows from before a STORAGE_BACKEND switch keep theirs).
// Never throws: callers delete the DB row regardless, because an orphaned
// object is recoverable and a stuck row is not.
export async function deleteMediaBlobs(rows: StoredMediaRef[], logTag: string): Promise<void> {
	const jobs: { key: string; run: Promise<void> }[] = [];
	for (const row of rows) {
		if (row.provider === 'immich') continue;
		const keys = [row.storageKey, row.originalKey, row.posterKey].filter(
			(k): k is string => typeof k === 'string' && k.length > 0
		);
		if (keys.length === 0) continue;
		let backend: ReturnType<typeof getStorage>;
		try {
			backend = getStorage(row.provider);
		} catch (err) {
			console.warn(`[${logTag}] storage provider ${row.provider} unavailable:`, err);
			continue;
		}
		for (const key of keys) jobs.push({ key, run: backend.delete(key) });
	}
	const results = await Promise.allSettled(jobs.map((j) => j.run));
	results.forEach((r, i) => {
		if (r.status === 'rejected') {
			console.warn(`[${logTag}] failed to delete object ${jobs[i].key}:`, r.reason);
		}
	});
}
