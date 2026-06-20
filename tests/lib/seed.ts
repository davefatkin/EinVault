import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import * as schema from '../../src/lib/server/db/schema';
import {
	seedRows,
	copyDemoPhotoFiles
} from '../../src/lib/server/db/demo-seed';

export { SEED } from '../../src/lib/server/db/demo-seed';

export type Role = 'admin' | 'member' | 'caretaker';

const MIGRATIONS_FOLDER = path.resolve(import.meta.dirname, '../../drizzle');

/** Creates dir, migrates a fresh DB at dir/einvault.db, seeds it, closes. */
export function createSeededDb(dir: string): string {
	fs.rmSync(dir, { recursive: true, force: true });
	fs.mkdirSync(dir, { recursive: true });
	const dbPath = path.join(dir, 'einvault.db');

	const sqlite = new Database(dbPath);
	sqlite.pragma('journal_mode = WAL');
	sqlite.pragma('foreign_keys = ON');
	const db = drizzle(sqlite, { schema });

	migrate(db, { migrationsFolder: MIGRATIONS_FOLDER });

	const now = Date.now();
	seedRows(db as never, { now });

	// Copy photo assets so e2e photo routes resolve.
	copyDemoPhotoFiles(path.join(dir, 'uploads'), now);

	sqlite.close(); // clean WAL handoff before the server opens the file
	return dbPath;
}

/**
 * Like createSeededDb but omits the active caretaker shift.
 * Use for off-shift caretaker tests that need a dedicated per-test server.
 */
export function createSeededDbNoShift(dir: string): string {
	const dbPath = createSeededDb(dir);
	// Re-open just to delete the active shift row, then close cleanly.
	const sqlite = new Database(dbPath);
	sqlite.pragma('journal_mode = WAL');
	sqlite.pragma('foreign_keys = ON');
	sqlite.prepare("DELETE FROM caretaker_shifts WHERE id = 'seed-shift-active'").run();
	sqlite.close();
	return dbPath;
}

/** Migrates an empty DB (pristine instance for the setup wizard project). */
export function createEmptyDb(dir: string): string {
	fs.rmSync(dir, { recursive: true, force: true });
	fs.mkdirSync(dir, { recursive: true });
	const dbPath = path.join(dir, 'einvault.db');
	const sqlite = new Database(dbPath);
	sqlite.pragma('journal_mode = WAL');
	sqlite.pragma('foreign_keys = ON');
	const db = drizzle(sqlite, { schema });
	migrate(db, { migrationsFolder: MIGRATIONS_FOLDER });
	sqlite.close();
	return dbPath;
}
