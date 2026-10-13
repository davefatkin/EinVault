import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

// Test helper for data migrations: tests run on their own database, because
// importing $server/db would migrate the whole chain before pre-migration rows
// could be inserted.
export const DRIZZLE_DIR = resolve(import.meta.dirname, '../../../../drizzle');

type Journal = { entries: { idx: number; when: number; tag: string }[] };

// Migrate through `tag` only, via a temp folder whose journal stops there. The
// real `when` values are kept: the later full migrate() only applies entries
// whose `when` is newer than the last one recorded.
export function migrateThrough(sqlite: Database.Database, tag: string) {
	const journal = JSON.parse(
		readFileSync(join(DRIZZLE_DIR, 'meta/_journal.json'), 'utf8')
	) as Journal;
	const cut = journal.entries.findIndex((e) => e.tag === tag);
	if (cut < 0) throw new Error(`migration ${tag} not found`);
	const entries = journal.entries.slice(0, cut + 1);
	const dir = mkdtempSync(join(tmpdir(), 'einvault-mig-'));
	try {
		mkdirSync(join(dir, 'meta'));
		for (const e of entries)
			copyFileSync(join(DRIZZLE_DIR, `${e.tag}.sql`), join(dir, `${e.tag}.sql`));
		writeFileSync(join(dir, 'meta/_journal.json'), JSON.stringify({ ...journal, entries }));
		migrate(drizzle(sqlite), { migrationsFolder: dir });
	} finally {
		rmSync(dir, { recursive: true, force: true });
	}
}
