import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import * as schema from '../../src/lib/server/db/schema';
import { seedRows, copyDemoPhotoFiles, SEED } from '../../src/lib/server/db/demo-seed';

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

	// Seed dobs are fixed calendar dates, so on some day of the year a companion
	// would celebrate and change banners/notifications. Mark every dob approximate
	// and clear homecoming dates so no seeded e2e world can ever celebrate.
	sqlite.exec('UPDATE companions SET dob_approximate = 1, homecoming_date = NULL');

	seedSetupComplete(db);

	// Copy photo assets so e2e photo routes resolve.
	copyDemoPhotoFiles(path.join(dir, 'uploads'), now);

	sqlite.close(); // clean WAL handoff before the server opens the file
	return dbPath;
}

/**
 * The seed has quick logs, journal and health data but no medications, so the
 * getting started card would show for every seeded owner. One finished
 * medication chain on Edward completes the household: a counted supply, an
 * ended medication drawing from it, a completed dose reminder and one dose
 * that took stock. Everything is in the past with alerts off, so no page or
 * warning treats it as current.
 */
function seedSetupComplete(db: ReturnType<typeof drizzle<typeof schema>>): void {
	const companionId = SEED.companions.edward.id;
	const userId = SEED.member.id;
	const at = new Date('2020-01-01T09:00:00Z');
	db.insert(schema.supplies)
		.values({
			id: 'seed-supply-edward-drops',
			name: 'Eye drop bottles',
			kind: 'counted',
			unit: 'bottle',
			quantity: 3,
			alertsEnabled: false,
			createdBy: userId
		})
		.run();
	db.insert(schema.supplyCompanions)
		.values({ supplyId: 'seed-supply-edward-drops', companionId })
		.run();
	db.insert(schema.medications)
		.values({
			id: 'seed-med-edward-drops',
			companionId,
			name: 'Eye drops',
			startedOn: '2020-01-01',
			endedOn: '2020-01-01',
			supplyId: 'seed-supply-edward-drops',
			loggedBy: userId
		})
		.run();
	db.insert(schema.reminders)
		.values({
			id: 'seed-reminder-edward-drops',
			companionId,
			title: 'Eye drops',
			type: 'medication',
			dueAt: at,
			completedAt: at,
			completedBy: userId,
			outcome: 'completed',
			medicationId: 'seed-med-edward-drops',
			loggedBy: userId
		})
		.run();
	db.insert(schema.medicationDoses)
		.values({
			id: 'seed-dose-edward-drops',
			medicationId: 'seed-med-edward-drops',
			givenAt: at,
			givenBy: userId,
			reminderId: 'seed-reminder-edward-drops',
			source: 'reminder'
		})
		.run();
	db.insert(schema.supplyEvents)
		.values({
			id: 'seed-supply-event-edward-drops',
			supplyId: 'seed-supply-edward-drops',
			type: 'use',
			at,
			quantityDelta: -1,
			doseId: 'seed-dose-edward-drops',
			companionId,
			createdBy: userId
		})
		.run();
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
