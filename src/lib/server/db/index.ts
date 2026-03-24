import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { mkdirSync, existsSync } from 'fs';
import { dirname, resolve } from 'path';
import * as schema from './schema';

function resolveDbPath(): string {
	const envPath = process.env.DATABASE_URL;

	if (envPath) {
		const dir = dirname(envPath);
		try {
			mkdirSync(dir, { recursive: true });
			return envPath;
		} catch {
			console.warn(
				`[einvault] Cannot create directory for DATABASE_URL="${envPath}", falling back to local dev path.`
			);
		}
	}

	const localPath = resolve('./data/einvault.db');
	mkdirSync(dirname(localPath), { recursive: true });
	return localPath;
}

const DATABASE_URL = resolveDbPath();
if (process.env.NODE_ENV !== 'production') {
	console.info(`[einvault] Database: ${DATABASE_URL}`);
	console.info('[einvault] For Tippy and Molly 🐾 and Ein who keeps watch');
}

const sqlite = new Database(DATABASE_URL);

sqlite.pragma('journal_mode = WAL');
sqlite.pragma('foreign_keys = ON');
sqlite.pragma('synchronous = NORMAL');
sqlite.pragma('busy_timeout = 5000');

export const db = drizzle(sqlite, { schema });

const MIGRATIONS_DIR = './drizzle';
if (existsSync(MIGRATIONS_DIR)) {
	migrate(db, { migrationsFolder: MIGRATIONS_DIR });
} else {
	console.warn('[einvault] No migrations found: run `npm run db:generate` then restart.');
}

export { schema };
