import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import bcrypt from 'bcryptjs';
import * as schema from '../../src/lib/server/db/schema';

export const SEED = {
	password: 'test-password-123',
	admin: { id: 'seed-spike', username: 'spike', displayName: 'Spike' },
	member: { id: 'seed-jet', username: 'jet', displayName: 'Jet' },
	caretaker: { id: 'seed-faye', username: 'faye', displayName: 'Faye' },
	resetUser: { id: 'seed-vicious', username: 'vicious', displayName: 'Vicious' },
	companions: {
		ein: {
			id: 'seed-comp-ein',
			name: 'Ein',
			species: 'dog',
			breed: 'Pembroke Welsh Corgi',
			sex: 'male',
			dob: '2022-03-15',
			weightUnit: 'lbs',
			microchip: '981020012345678',
			bio: 'A Pembroke Welsh Corgi with a quiet secret: he is a data dog, the product of a research lab that left him improbably, almost unnervingly intelligent. Patient, unbothered, and far more aware of what is going on than he ever lets show.',
			feedingSchedule: 'Half cup of kibble at 7am and 6pm.',
			walkSchedule: 'Two short walks, after breakfast and before dark.',
			medicationSchedule: 'Heartworm chew on the first of the month.',
			vetName: 'Dr. Bacchus',
			vetPhone: '(555) 287-3300',
			vetClinic: 'Animal Treasure Veterinary',
			emergencyContactName: 'Julia',
			emergencyContactPhone: '(555) 010-1979',
			notesForSitter:
				'Responds to hand signals better than words. Keep him away from unattended laptops; he will use them. Favorite treat is dried sardines.'
		},
		edward: {
			id: 'seed-comp-edward',
			name: 'Edward',
			species: 'dog',
			breed: 'Mixed breed (mostly mischief)',
			sex: 'female',
			dob: '2024-09-02',
			weightUnit: 'lbs',
			microchip: '981020087654321',
			bio: 'Named after a one-of-a-kind kid and just as untamable. A barefoot-at-heart mutt who treats the whole house as a playground and every closed door as a personal challenge. Pure chaos with a wagging tail.',
			feedingSchedule: 'Free-fed kibble; extra treats only after she does a trick.',
			walkSchedule: 'One long off-leash run whenever she tolerates the leash.',
			medicationSchedule: 'Flea and tick topical, monthly.',
			vetName: 'Dr. Bacchus',
			vetPhone: '(555) 287-3300',
			vetClinic: 'Animal Treasure Veterinary',
			emergencyContactName: 'Mr. Appledelhi',
			emergencyContactPhone: '(555) 010-2244',
			notesForSitter:
				'She will disappear and reappear at will; this is normal. No shoes needed indoors. Keep snacks up high and your passwords to yourself.'
		}
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
			{
				...SEED.admin,
				passwordHash,
				role: 'admin',
				email: 'spike@swordfish2.ship',
				phone: '(555) 010-2071'
			},
			{
				...SEED.member,
				passwordHash,
				role: 'member',
				email: 'jet@hammerhead.ship',
				phone: '(555) 010-7402'
			},
			{
				...SEED.caretaker,
				passwordHash,
				role: 'caretaker',
				email: 'faye@redtail.ship',
				phone: '(555) 010-0613'
			},
			{
				...SEED.resetUser,
				passwordHash,
				role: 'member',
				email: 'vicious@reddragon.club',
				phone: '(555) 010-3417'
			}
		])
		.run();

	db.insert(schema.companions)
		.values([{ ...SEED.companions.ein }, { ...SEED.companions.edward }])
		.run();

	db.insert(schema.companionCaretakers)
		.values({ companionId: SEED.companions.ein.id, userId: SEED.caretaker.id })
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
			companionId: SEED.companions.ein.id,
			title: 'Annual checkup',
			type: 'vet',
			dueAt: new Date(now + 30 * day)
		})
		.run();

	db.insert(schema.journalEntries)
		.values({
			id: 'seed-journal-1',
			companionId: SEED.companions.ein.id,
			date: '2026-01-15',
			body: 'Clean bill of health at his checkup. Treated him to a long walk afterward.',
			mood: 'good',
			loggedBy: SEED.member.id
		})
		.run();

	db.insert(schema.healthEvents)
		.values({
			id: 'seed-health-1',
			companionId: SEED.companions.ein.id,
			type: 'vet_visit',
			title: 'Wellness checkup',
			occurredAt: new Date('2026-03-01T12:00:00Z'),
			loggedBy: SEED.member.id
		})
		.run();

	// Weight history so the trend chart and weight card render a real curve.
	db.insert(schema.weightEntries)
		.values([
			{
				id: 'seed-weight-1',
				companionId: SEED.companions.ein.id,
				weight: 27.6,
				unit: 'lbs',
				recordedAt: new Date(now - 150 * day),
				loggedBy: SEED.member.id
			},
			{
				id: 'seed-weight-2',
				companionId: SEED.companions.ein.id,
				weight: 28.1,
				unit: 'lbs',
				recordedAt: new Date(now - 110 * day),
				loggedBy: SEED.member.id
			},
			{
				id: 'seed-weight-3',
				companionId: SEED.companions.ein.id,
				weight: 28.5,
				unit: 'lbs',
				recordedAt: new Date(now - 70 * day),
				loggedBy: SEED.member.id
			},
			{
				id: 'seed-weight-4',
				companionId: SEED.companions.ein.id,
				weight: 28.3,
				unit: 'lbs',
				recordedAt: new Date(now - 35 * day),
				loggedBy: SEED.member.id
			},
			{
				id: 'seed-weight-5',
				companionId: SEED.companions.ein.id,
				weight: 28.7,
				unit: 'lbs',
				recordedAt: new Date(now - 5 * day),
				loggedBy: SEED.member.id
			}
		])
		.run();

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
