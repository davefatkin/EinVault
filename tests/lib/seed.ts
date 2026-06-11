import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import bcrypt from 'bcryptjs';
import * as schema from '../../src/lib/server/db/schema';

export const SEED = {
	password: 'test-password-123',
	admin: { id: 'seed-admin', username: 'seed-admin', displayName: 'Seed Admin' },
	member: { id: 'seed-member', username: 'seed-member', displayName: 'Seed Member' },
	caretaker: { id: 'seed-caretaker', username: 'seed-caretaker', displayName: 'Seed Caretaker' },
	resetUser: { id: 'seed-reset', username: 'seed-reset', displayName: 'Seed Reset' },
	companions: {
		biscuit: { id: 'seed-comp-biscuit', name: 'Biscuit' },
		waffles: { id: 'seed-comp-waffles', name: 'Waffles' }
	}
} as const;

export type Role = 'admin' | 'member' | 'caretaker';

// One hash for all seed users; computed once per process (bcrypt cost 12 ~100ms).
const passwordHash = bcrypt.hashSync(SEED.password, 12);

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
	const day = 24 * 60 * 60 * 1000;

	db.insert(schema.users)
		.values([
			{ ...SEED.admin, passwordHash, role: 'admin', email: 'seed-admin@example.com' },
			{ ...SEED.member, passwordHash, role: 'member', email: 'seed-member@example.com' },
			{ ...SEED.caretaker, passwordHash, role: 'caretaker', email: 'seed-caretaker@example.com' },
			{ ...SEED.resetUser, passwordHash, role: 'member', email: 'seed-reset@example.com' }
		])
		.run();

	db.insert(schema.companions)
		.values([{ ...SEED.companions.biscuit }, { ...SEED.companions.waffles }])
		.run();

	db.insert(schema.companionCaretakers)
		.values({ companionId: SEED.companions.biscuit.id, userId: SEED.caretaker.id })
		.run();

	// Active shift so the caretaker can see their companion.
	db.insert(schema.caretakerShifts)
		.values({
			id: 'seed-shift-active',
			userId: SEED.caretaker.id,
			startAt: new Date(now - 1 * 60 * 60 * 1000),
			endAt: new Date(now + 8 * 60 * 60 * 1000)
		})
		.run();

	// Reminder times far-future: the boot notify scan must not emit into sinks
	// during unrelated specs.
	db.insert(schema.reminders)
		.values({
			id: 'seed-reminder-1',
			companionId: SEED.companions.biscuit.id,
			title: 'Seed vet visit',
			type: 'vet',
			dueAt: new Date(now + 30 * day)
		})
		.run();

	db.insert(schema.journalEntries)
		.values({
			id: 'seed-journal-1',
			companionId: SEED.companions.biscuit.id,
			date: '2026-01-15',
			body: 'Seed journal entry',
			mood: 'good',
			loggedBy: SEED.member.id
		})
		.run();

	db.insert(schema.healthEvents)
		.values({
			id: 'seed-health-1',
			companionId: SEED.companions.biscuit.id,
			type: 'vet_visit',
			title: 'Seed checkup',
			occurredAt: new Date('2026-03-01T12:00:00Z'),
			loggedBy: SEED.member.id
		})
		.run();

	sqlite.close(); // clean WAL handoff before the server opens the file
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
