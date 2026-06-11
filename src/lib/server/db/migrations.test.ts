import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// Drizzle's migrator applies a migration only when its journal `when` exceeds
// the newest already-applied migration's timestamp. A migration whose `when` is
// less than its predecessor's is silently skipped on any DB that already has the
// predecessor — fresh installs apply everything in order and never reveal it. So
// guard the invariant directly: timestamps must strictly increase with idx.
describe('drizzle journal', () => {
	const journal = JSON.parse(
		readFileSync(resolve(import.meta.dirname, '../../../../drizzle/meta/_journal.json'), 'utf8')
	) as { entries: { idx: number; when: number; tag: string }[] };

	it('has strictly increasing idx and when', () => {
		const entries = [...journal.entries].sort((a, b) => a.idx - b.idx);
		for (let i = 1; i < entries.length; i++) {
			expect(entries[i].idx, `idx gap before ${entries[i].tag}`).toBe(entries[i - 1].idx + 1);
			expect(
				entries[i].when,
				`migration ${entries[i].tag} (when=${entries[i].when}) must be newer than ${entries[i - 1].tag} (when=${entries[i - 1].when})`
			).toBeGreaterThan(entries[i - 1].when);
		}
	});
});
