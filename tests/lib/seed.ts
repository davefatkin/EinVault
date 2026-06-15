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

	// --- Demo history across both companions (richer dashboards / screenshots) ---
	const ein = SEED.companions.ein.id;
	const edward = SEED.companions.edward.id;
	const jet = SEED.member.id;
	const faye = SEED.caretaker.id;
	const hour = 60 * 60 * 1000;

	// Activity log: today + the last couple of days.
	db.insert(schema.dailyEvents)
		.values([
			{
				id: 'seed-act-1',
				companionId: ein,
				type: 'walk',
				durationMinutes: 30,
				notes: 'Long loop around the block.',
				loggedAt: new Date(now - 2 * hour),
				loggedBy: faye
			},
			{
				id: 'seed-act-2',
				companionId: ein,
				type: 'meal',
				loggedAt: new Date(now - 5 * hour),
				loggedBy: faye
			},
			{
				id: 'seed-act-3',
				companionId: ein,
				type: 'bathroom',
				loggedAt: new Date(now - 6 * hour),
				loggedBy: faye
			},
			{
				id: 'seed-act-4',
				companionId: ein,
				type: 'play',
				durationMinutes: 15,
				notes: 'Tug of war. He won.',
				loggedAt: new Date(now - 1 * hour),
				loggedBy: jet
			},
			{
				id: 'seed-act-5',
				companionId: ein,
				type: 'walk',
				durationMinutes: 25,
				loggedAt: new Date(now - 1 * day - 3 * hour),
				loggedBy: jet
			},
			{
				id: 'seed-act-6',
				companionId: ein,
				type: 'meal',
				loggedAt: new Date(now - 1 * day - 8 * hour),
				loggedBy: jet
			},
			{
				id: 'seed-act-7',
				companionId: ein,
				type: 'grooming',
				notes: 'Quick brush.',
				loggedAt: new Date(now - 2 * day),
				loggedBy: jet
			},
			{
				id: 'seed-act-8',
				companionId: edward,
				type: 'meal',
				loggedAt: new Date(now - 4 * hour),
				loggedBy: jet
			},
			{
				id: 'seed-act-9',
				companionId: edward,
				type: 'walk',
				durationMinutes: 20,
				notes: 'Off-leash, eventually.',
				loggedAt: new Date(now - 3 * hour),
				loggedBy: jet
			},
			{
				id: 'seed-act-10',
				companionId: edward,
				type: 'treat',
				loggedAt: new Date(now - 1 * day - 2 * hour),
				loggedBy: jet
			},
			{
				id: 'seed-act-11',
				companionId: edward,
				type: 'play',
				durationMinutes: 20,
				loggedAt: new Date(now - 1 * day - 5 * hour),
				loggedBy: jet
			}
		])
		.run();

	// More journal entries on distinct past dates (uniquePerDay).
	db.insert(schema.journalEntries)
		.values([
			{
				id: 'seed-journal-2',
				companionId: ein,
				date: '2026-04-18',
				body: 'Met a very serious cat on the morning walk. A long standoff was had. No clear winner.',
				mood: 'great',
				loggedBy: faye
			},
			{
				id: 'seed-journal-3',
				companionId: ein,
				date: '2026-04-02',
				body: 'Slept through the entire afternoon in a single sunbeam. Productivity zero, contentment maximal.',
				mood: 'good',
				loggedBy: jet
			},
			{
				id: 'seed-journal-4',
				companionId: edward,
				date: '2026-05-18',
				body: 'Dismantled the couch cushions hunting for a toy that was in plain sight the whole time. Triumphant regardless.',
				mood: 'great',
				loggedBy: jet
			},
			{
				id: 'seed-journal-5',
				companionId: edward,
				date: '2026-03-22',
				body: 'Refused the leash for twenty minutes, then walked perfectly. On her terms, as always.',
				mood: 'meh',
				loggedBy: jet
			}
		])
		.run();

	// More health events (past dates; titles avoid the search-test tokens).
	db.insert(schema.healthEvents)
		.values([
			{
				id: 'seed-health-2',
				companionId: ein,
				type: 'vaccination',
				title: 'Rabies vaccination',
				occurredAt: new Date('2025-12-10T15:00:00Z'),
				vetName: 'Dr. Bacchus',
				vetClinic: 'Animal Treasure Veterinary',
				loggedBy: jet
			},
			{
				id: 'seed-health-3',
				companionId: ein,
				type: 'procedure',
				title: 'Dental cleaning',
				occurredAt: new Date('2026-02-14T15:00:00Z'),
				vetName: 'Dr. Bacchus',
				vetClinic: 'Animal Treasure Veterinary',
				loggedBy: jet
			},
			{
				id: 'seed-health-4',
				companionId: edward,
				type: 'procedure',
				title: 'Spay surgery',
				occurredAt: new Date('2025-11-05T15:00:00Z'),
				vetName: 'Dr. Bacchus',
				vetClinic: 'Animal Treasure Veterinary',
				loggedBy: jet
			},
			{
				id: 'seed-health-5',
				companionId: edward,
				type: 'medication',
				title: 'Ear infection treatment',
				notes: 'Two-week course of ear drops.',
				occurredAt: new Date('2026-04-10T15:00:00Z'),
				loggedBy: jet
			}
		])
		.run();

	// More reminders. All far-future so the boot notify scan stays quiet and both
	// companions read "up to date".
	db.insert(schema.reminders)
		.values([
			{
				id: 'seed-reminder-2',
				companionId: ein,
				title: 'Grooming appointment',
				type: 'grooming',
				dueAt: new Date(now + 28 * day),
				loggedBy: jet
			},
			{
				id: 'seed-reminder-3',
				companionId: ein,
				title: 'Rabies booster',
				type: 'vaccination',
				dueAt: new Date(now + 60 * day),
				loggedBy: jet
			},
			{
				id: 'seed-reminder-4',
				companionId: edward,
				title: 'Flea and tick dose',
				type: 'medication',
				dueAt: new Date(now + 25 * day),
				loggedBy: jet
			},
			{
				id: 'seed-reminder-5',
				companionId: edward,
				title: 'Spay follow-up',
				type: 'vet',
				dueAt: new Date(now + 45 * day),
				loggedBy: jet
			},
			{
				// Due during the active caretaker shift so the care dashboard surfaces it.
				// Still in the future, so the boot notify scan (which only emits for
				// already-due reminders) stays quiet.
				id: 'seed-reminder-6',
				companionId: ein,
				title: 'Evening medication',
				type: 'medication',
				dueAt: new Date(now + 4 * hour),
				loggedBy: jet
			}
		])
		.run();

	// Edward weight history.
	db.insert(schema.weightEntries)
		.values([
			{
				id: 'seed-weight-e1',
				companionId: edward,
				weight: 17.8,
				unit: 'lbs',
				recordedAt: new Date(now - 120 * day),
				loggedBy: jet
			},
			{
				id: 'seed-weight-e2',
				companionId: edward,
				weight: 18.6,
				unit: 'lbs',
				recordedAt: new Date(now - 80 * day),
				loggedBy: jet
			},
			{
				id: 'seed-weight-e3',
				companionId: edward,
				weight: 19.2,
				unit: 'lbs',
				recordedAt: new Date(now - 40 * day),
				loggedBy: jet
			},
			{
				id: 'seed-weight-e4',
				companionId: edward,
				weight: 19.0,
				unit: 'lbs',
				recordedAt: new Date(now - 8 * day),
				loggedBy: jet
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
