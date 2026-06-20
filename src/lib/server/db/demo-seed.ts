import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { copyFileSync, mkdirSync, existsSync, rmSync, statSync } from 'node:fs';
import { join, dirname, resolve } from 'path';
import { fileURLToPath } from 'url';
import bcrypt from 'bcryptjs';
import { db, schema } from '$server/db';

// One hash for all seed users; computed once per process (bcrypt cost 12 ~100ms).
export const SEED_PASSWORD_HASH = bcrypt.hashSync('test-password-123', 12);

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

const ASSETS_DIR = join(dirname(fileURLToPath(import.meta.url)), 'demo-assets');

/**
 * Day-offset (relative to `now`) for each journal entry that has linked photos.
 * Kept here so `buildPhotoManifest` and `seedContent` share the same source of
 * truth — changing a journal entry's date in seedContent means updating it here
 * too, and the compiler will catch any ID typos.
 */
const JOURNAL_ENTRY_DAY_OFFSETS: Record<string, { companionId: string; dayOffset: number }> = {
	'seed-journal-ein-d2': { companionId: SEED.companions.ein.id, dayOffset: 3 },
	'seed-journal-ein-d7': { companionId: SEED.companions.ein.id, dayOffset: 17 },
	'seed-journal-edward-d4': { companionId: SEED.companions.edward.id, dayOffset: 8 },
	'seed-journal-edward-d10': { companionId: SEED.companions.edward.id, dayOffset: 36 }
} as const;

/**
 * Single source of truth for demo photo rows AND files.
 * `date` is derived from `now` via JOURNAL_ENTRY_DAY_OFFSETS so storageKeys
 * always match the journal entries they belong to.
 * companionId + date + filename → storageKey.
 */
export function buildPhotoManifest(now: number): Array<{
	id: string;
	entryId: string;
	filename: string;
	companionId: string;
	date: string;
	storageKey: string;
}> {
	const day = 24 * 60 * 60 * 1000;

	function toDateStr(entryId: string): string {
		const info = JOURNAL_ENTRY_DAY_OFFSETS[entryId];
		if (!info) throw new Error(`No day offset registered for journal entry: ${entryId}`);
		return new Date(now - info.dayOffset * day).toISOString().slice(0, 10);
	}

	function companionFor(entryId: string): string {
		const info = JOURNAL_ENTRY_DAY_OFFSETS[entryId];
		if (!info) throw new Error(`No companion registered for journal entry: ${entryId}`);
		return info.companionId;
	}

	const photos = [
		{ id: 'seed-photo-ein-01', entryId: 'seed-journal-ein-d2', filename: 'ein-01.jpg' },
		{ id: 'seed-photo-ein-02', entryId: 'seed-journal-ein-d2', filename: 'ein-02.jpg' },
		{ id: 'seed-photo-ein-03', entryId: 'seed-journal-ein-d7', filename: 'ein-03.jpg' },
		{ id: 'seed-photo-edward-01', entryId: 'seed-journal-edward-d4', filename: 'edward-01.jpg' },
		{ id: 'seed-photo-edward-02', entryId: 'seed-journal-edward-d4', filename: 'edward-02.jpg' },
		{ id: 'seed-photo-edward-03', entryId: 'seed-journal-edward-d10', filename: 'edward-03.jpg' }
	];

	return photos.map((p) => {
		const companionId = companionFor(p.entryId);
		const date = toDateStr(p.entryId);
		return {
			...p,
			companionId,
			date,
			storageKey: `journal/${companionId}/${date}/${p.filename}`
		};
	});
}

/** Inserts the 4 user rows. Date-independent; safe to call separately. */
export function seedUsers(db: BetterSQLite3Database<typeof schema>): void {
	const passwordHash = SEED_PASSWORD_HASH;

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
}

/**
 * Inserts companions, shifts, journal entries, photos, health events,
 * weight entries, daily events, and reminders. All date-sensitive rows
 * are anchored to `now` so re-anchoring works cleanly.
 */
export function seedContent(db: BetterSQLite3Database<typeof schema>, opts: { now: number }): void {
	const now = opts.now;
	const day = 24 * 60 * 60 * 1000;
	const hour = 60 * 60 * 1000;

	const ein = SEED.companions.ein.id;
	const edward = SEED.companions.edward.id;
	const spike = SEED.admin.id;
	const jet = SEED.member.id;
	const faye = SEED.caretaker.id;

	db.insert(schema.companions)
		.values([{ ...SEED.companions.ein }, { ...SEED.companions.edward }])
		.run();

	db.insert(schema.companionCaretakers).values({ companionId: ein, userId: faye }).run();

	// Active shift so the caretaker can see their companion.
	db.insert(schema.caretakerShifts)
		.values({
			id: 'seed-shift-active',
			userId: faye,
			startAt: new Date(now - 1 * hour),
			endAt: new Date(now + 8 * hour)
		})
		.run();

	// ---- Reminders: upcoming, overdue, completed, recurring ----
	db.insert(schema.reminders)
		.values([
			{
				id: 'seed-reminder-1',
				companionId: ein,
				title: 'Annual checkup',
				type: 'vet',
				dueAt: new Date(now + 30 * day)
			},
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
				// Overdue: past due, not completed
				id: 'seed-reminder-overdue',
				companionId: ein,
				title: 'Dental check',
				type: 'vet',
				dueAt: new Date(now - 5 * day),
				loggedBy: jet
			},
			{
				// Completed
				id: 'seed-reminder-completed',
				companionId: ein,
				title: 'Flea treatment',
				type: 'medication',
				dueAt: new Date(now - 10 * day),
				completedAt: new Date(now - 10 * day + 2 * hour),
				completedBy: jet,
				loggedBy: jet
			},
			{
				// Recurring: monthly heartworm chew
				id: 'seed-reminder-recurring',
				companionId: ein,
				title: 'Heartworm chew',
				type: 'medication',
				dueAt: new Date(now + 15 * day),
				isRecurring: true,
				recurrenceUnit: 'month',
				recurrenceInterval: 1,
				loggedBy: spike
			},
			{
				// Due during the active caretaker shift so the care dashboard surfaces it.
				id: 'seed-reminder-6',
				companionId: ein,
				title: 'Evening medication',
				type: 'medication',
				dueAt: new Date(now + 4 * hour),
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
				// Edward overdue
				id: 'seed-reminder-edward-overdue',
				companionId: edward,
				title: 'Nail trim',
				type: 'grooming',
				dueAt: new Date(now - 3 * day),
				loggedBy: jet
			},
			{
				// Edward recurring
				id: 'seed-reminder-edward-recurring',
				companionId: edward,
				title: 'Flea and tick topical',
				type: 'medication',
				dueAt: new Date(now + 20 * day),
				isRecurring: true,
				recurrenceUnit: 'month',
				recurrenceInterval: 1,
				loggedBy: jet
			}
		])
		.run();

	// ---- Weight history ----
	db.insert(schema.weightEntries)
		.values([
			// Ein: gentle realistic trend for a Pembroke Welsh Corgi (~24-26 lbs)
			{
				id: 'seed-weight-1',
				companionId: ein,
				weight: 24.2,
				unit: 'lbs',
				recordedAt: new Date(now - 150 * day),
				loggedBy: jet
			},
			{
				id: 'seed-weight-2',
				companionId: ein,
				weight: 24.8,
				unit: 'lbs',
				recordedAt: new Date(now - 110 * day),
				loggedBy: jet
			},
			{
				id: 'seed-weight-3',
				companionId: ein,
				weight: 25.3,
				unit: 'lbs',
				recordedAt: new Date(now - 70 * day),
				loggedBy: jet
			},
			{
				id: 'seed-weight-4',
				companionId: ein,
				weight: 25.1,
				unit: 'lbs',
				recordedAt: new Date(now - 35 * day),
				loggedBy: jet
			},
			{
				id: 'seed-weight-5',
				companionId: ein,
				weight: 25.6,
				unit: 'lbs',
				recordedAt: new Date(now - 5 * day),
				loggedBy: jet
			},
			// Edward: young growing dog, trending up
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

	// ---- Health events ----
	db.insert(schema.healthEvents)
		.values([
			{
				id: 'seed-health-1',
				companionId: ein,
				type: 'vet_visit',
				title: 'Wellness checkup',
				occurredAt: new Date(now - 50 * day),
				loggedBy: jet
			},
			{
				id: 'seed-health-2',
				companionId: ein,
				type: 'vaccination',
				title: 'Rabies vaccination',
				occurredAt: new Date(now - 200 * day),
				vetName: 'Dr. Bacchus',
				vetClinic: 'Animal Treasure Veterinary',
				loggedBy: jet
			},
			{
				id: 'seed-health-3',
				companionId: ein,
				type: 'procedure',
				title: 'Dental cleaning',
				occurredAt: new Date(now - 130 * day),
				vetName: 'Dr. Bacchus',
				vetClinic: 'Animal Treasure Veterinary',
				loggedBy: jet
			},
			{
				id: 'seed-health-4',
				companionId: edward,
				type: 'procedure',
				title: 'Spay surgery',
				occurredAt: new Date(now - 250 * day),
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
				occurredAt: new Date(now - 75 * day),
				loggedBy: jet
			},
			{
				id: 'seed-health-6',
				companionId: edward,
				type: 'vet_visit',
				title: 'Puppy wellness visit',
				occurredAt: new Date(now - 100 * day),
				vetName: 'Dr. Bacchus',
				vetClinic: 'Animal Treasure Veterinary',
				loggedBy: jet
			}
		])
		.run();

	// ---- Daily events: walk/meal/bathroom/treat/play/grooming ----
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
			},
			// Extra daily events for broader event-group variety
			{
				id: 'seed-act-12',
				companionId: ein,
				type: 'treat',
				notes: 'Dried sardine as reward.',
				loggedAt: new Date(now - 3 * day - 1 * hour),
				loggedBy: jet,
				eventGroupId: 'seed-group-morning-routine'
			},
			{
				id: 'seed-act-13',
				companionId: ein,
				type: 'walk',
				durationMinutes: 20,
				loggedAt: new Date(now - 3 * day),
				loggedBy: jet,
				eventGroupId: 'seed-group-morning-routine'
			}
		])
		.run();

	// ---- Journal entries: ~10-14 per companion, all moods, unique per date ----
	// Ein journal entries across the last ~6 weeks
	db.insert(schema.journalEntries)
		.values([
			{
				id: 'seed-journal-ein-d1',
				companionId: ein,
				date: new Date(now - 1 * day).toISOString().slice(0, 10),
				body: 'Spent most of the morning watching the courtyard with unusual focus. Something out there only he can see.',
				mood: 'good',
				loggedBy: spike
			},
			{
				id: 'seed-journal-ein-d2',
				companionId: ein,
				date: new Date(now - 3 * day).toISOString().slice(0, 10),
				body: 'He sat next to me while I worked, placing one paw on the keyboard at key moments. Good notes, honestly.',
				mood: 'great',
				loggedBy: faye
			},
			{
				id: 'seed-journal-ein-d3',
				companionId: ein,
				date: new Date(now - 5 * day).toISOString().slice(0, 10),
				body: 'Off his food this morning. Ate well in the evening. Keeping an eye on it.',
				mood: 'meh',
				loggedBy: jet
			},
			{
				id: 'seed-journal-ein-d4',
				companionId: ein,
				date: new Date(now - 7 * day).toISOString().slice(0, 10),
				body: 'Met a very serious cat on the morning walk. A long standoff was had. No clear winner.',
				mood: 'great',
				loggedBy: faye
			},
			{
				id: 'seed-journal-ein-d5',
				companionId: ein,
				date: new Date(now - 10 * day).toISOString().slice(0, 10),
				body: 'Limping slightly after the afternoon walk — checked paws, nothing obvious. Rested the rest of the day.',
				mood: 'off',
				loggedBy: jet
			},
			{
				id: 'seed-journal-ein-d6',
				companionId: ein,
				date: new Date(now - 14 * day).toISOString().slice(0, 10),
				body: 'Slept through the entire afternoon in a single sunbeam. Productivity zero, contentment maximal.',
				mood: 'good',
				loggedBy: jet
			},
			{
				id: 'seed-journal-ein-d7',
				companionId: ein,
				date: new Date(now - 17 * day).toISOString().slice(0, 10),
				body: 'Absolutely demolished his enrichment toy in record time. The kibble inside was recovered in under three minutes.',
				mood: 'great',
				loggedBy: spike
			},
			{
				id: 'seed-journal-ein-d8',
				companionId: ein,
				date: new Date(now - 21 * day).toISOString().slice(0, 10),
				body: 'Upset stomach — soft food only, small portions. Vet said to monitor for 48 hours.',
				mood: 'sick',
				loggedBy: jet
			},
			{
				id: 'seed-journal-ein-d9',
				companionId: ein,
				date: new Date(now - 28 * day).toISOString().slice(0, 10),
				body: 'Clean bill of health at his checkup. Treated him to a long walk afterward.',
				mood: 'good',
				loggedBy: jet
			},
			{
				id: 'seed-journal-ein-d10',
				companionId: ein,
				date: new Date(now - 35 * day).toISOString().slice(0, 10),
				body: 'Two new tricks mastered: high-five and spin. He performed them in sequence without being asked.',
				mood: 'great',
				loggedBy: spike
			},
			{
				id: 'seed-journal-ein-d11',
				companionId: ein,
				date: new Date(now - 40 * day).toISOString().slice(0, 10),
				body: 'Quiet day indoors. Rain kept walks short. He approved of the blanket arrangement.',
				mood: 'good',
				loggedBy: jet
			}
		])
		.run();

	// Edward journal entries
	db.insert(schema.journalEntries)
		.values([
			{
				id: 'seed-journal-edward-d1',
				companionId: edward,
				date: new Date(now - 2 * day).toISOString().slice(0, 10),
				body: 'Rearranged the entire living room while everyone was asleep. Cause unknown. Motive unclear.',
				mood: 'great',
				loggedBy: jet
			},
			{
				id: 'seed-journal-edward-d2',
				companionId: edward,
				date: new Date(now - 4 * day).toISOString().slice(0, 10),
				body: 'Dismantled the couch cushions hunting for a toy that was in plain sight the whole time. Triumphant regardless.',
				mood: 'great',
				loggedBy: jet
			},
			{
				id: 'seed-journal-edward-d3',
				companionId: edward,
				date: new Date(now - 6 * day).toISOString().slice(0, 10),
				body: 'Refused the leash for twenty minutes, then walked perfectly. On her terms, as always.',
				mood: 'meh',
				loggedBy: jet
			},
			{
				id: 'seed-journal-edward-d4',
				companionId: edward,
				date: new Date(now - 8 * day).toISOString().slice(0, 10),
				body: 'Chased a leaf for a full ten minutes. Caught it. Deemed it unworthy. Released it. Standards are high.',
				mood: 'great',
				loggedBy: spike
			},
			{
				id: 'seed-journal-edward-d5',
				companionId: edward,
				date: new Date(now - 11 * day).toISOString().slice(0, 10),
				body: 'Picky about food today. Only ate after it was served on the good dish. We are being managed.',
				mood: 'off',
				loggedBy: jet
			},
			{
				id: 'seed-journal-edward-d6',
				companionId: edward,
				date: new Date(now - 15 * day).toISOString().slice(0, 10),
				body: 'Small cut on one pad from the park. Cleaned and wrapped. She cooperated surprisingly well.',
				mood: 'off',
				loggedBy: jet
			},
			{
				id: 'seed-journal-edward-d7',
				companionId: edward,
				date: new Date(now - 18 * day).toISOString().slice(0, 10),
				body: 'Ear infection flare — vet prescribed a second course of drops. She is not pleased about this.',
				mood: 'sick',
				loggedBy: jet
			},
			{
				id: 'seed-journal-edward-d8',
				companionId: edward,
				date: new Date(now - 22 * day).toISOString().slice(0, 10),
				body: 'Excellent run in the park. She outpaced every other dog there and seemed quietly smug about it.',
				mood: 'great',
				loggedBy: spike
			},
			{
				id: 'seed-journal-edward-d9',
				companionId: edward,
				date: new Date(now - 29 * day).toISOString().slice(0, 10),
				body: 'Good appetite, good energy. Learned sit-stay at last. The treat budget is suffering.',
				mood: 'good',
				loggedBy: jet
			},
			{
				id: 'seed-journal-edward-d10',
				companionId: edward,
				date: new Date(now - 36 * day).toISOString().slice(0, 10),
				body: 'Quiet day. Stayed close, which is unusual for her. Comfortable and warm on the couch all afternoon.',
				mood: 'good',
				loggedBy: jet
			},
			{
				id: 'seed-journal-edward-d11',
				companionId: edward,
				date: new Date(now - 42 * day).toISOString().slice(0, 10),
				body: 'First time on the agility set. She figured out the tunnel immediately and refused to leave it.',
				mood: 'great',
				loggedBy: spike
			}
		])
		.run();

	// ---- Journal photos ----
	const photoManifest = buildPhotoManifest(now);

	const photoRows = photoManifest.map(({ id, entryId, filename, storageKey }) => {
		let sizeBytes = 84000; // plausible placeholder
		try {
			const assetPath = join(ASSETS_DIR, filename);
			if (existsSync(assetPath)) {
				sizeBytes = statSync(assetPath).size;
			}
		} catch {
			// fall back to placeholder
		}
		return {
			id,
			entryId,
			filename,
			provider: 'local' as const,
			storageKey,
			originalName: filename,
			mediaType: 'photo' as const,
			mimeType: 'image/jpeg',
			sizeBytes,
			status: 'ready' as const,
			loggedBy: jet
		};
	});

	db.insert(schema.journalPhotos).values(photoRows).run();
}

/** Inserts all seed rows (users + content). Convenience wrapper for existing callers. */
export function seedRows(db: BetterSQLite3Database<typeof schema>, opts: { now: number }): void {
	seedUsers(db);
	seedContent(db, opts);
}

/**
 * Idempotent: inserts the four demo user rows if they don't already exist.
 * Safe to call multiple times; skips rows that are already present.
 * Returns the number of rows inserted (0 if already seeded).
 */
export async function ensureDemoUsers(): Promise<number> {
	// Check if spike already exists
	const existing = await db.query.users.findFirst({
		where: (u, { eq }) => eq(u.id, SEED.admin.id)
	});
	if (existing) return 0;
	seedUsers(db as never);
	return 4;
}

/**
 * Wipes all demo content rows (companions + their cascade children,
 * plus explicit deletes for tables with user FK), then re-seeds
 * anchored to `now`. Also copies photo files.
 *
 * Called at boot and every 24h by startDemoRefreshScheduler.
 */
export function refreshDemoContent(): void {
	// Fail closed: this is destructive (wipes every companion + rmSync of the
	// journal uploads dir). It must never run against a real instance. Guard on
	// the raw env (not the resolved const) so this module avoids importing $env,
	// which would break the Playwright test runner that loads it.
	if (process.env.DEMO_MODE?.trim().toLowerCase() !== 'true') {
		throw new Error('refreshDemoContent must only run with DEMO_MODE enabled');
	}
	const now = Date.now();
	db.transaction((tx) => {
		// Explicit deletes for tables that reference both users and companions
		// (cascade from companions alone would leave orphan rows if user deleted first)
		tx.delete(schema.caretakerShifts).run();
		tx.delete(schema.companionCaretakers).run();
		// companions cascade to: journalEntries -> journalPhotos, healthEvents,
		// weightEntries, dailyEvents, reminders
		tx.delete(schema.companions).run();
		seedContent(tx as never, { now });
	});
	// Resolve DATA_DIR at call time so this module does not import $env at the
	// top level (which breaks the Playwright test runner that loads seed.ts).
	const dataDir = process.env.DATABASE_URL ? dirname(process.env.DATABASE_URL) : resolve('./data');
	copyDemoPhotoFiles(join(dataDir, 'uploads'), now);
}

let demoRefreshTimer: ReturnType<typeof setInterval> | null = null;

const DEMO_REFRESH_INTERVAL_MS = 24 * 60 * 60 * 1000; // 24 hours

/**
 * Starts the 24-hour demo content refresh timer. Idempotent — calling twice
 * is a no-op. The timer is unref'd so it never keeps the process alive.
 */
export function startDemoRefreshScheduler(): void {
	if (demoRefreshTimer) return;
	demoRefreshTimer = setInterval(() => {
		try {
			refreshDemoContent();
		} catch (err) {
			console.error('[demo] refresh failed:', err);
		}
	}, DEMO_REFRESH_INTERVAL_MS);
	demoRefreshTimer.unref();
	console.info('[demo] demo refresh scheduler started (24h interval)');
}

/**
 * Copies bundled demo asset JPEGs to the uploads directory, keyed by storageKey
 * derived from `now`. Clears stale dated dirs first so re-anchoring is clean.
 */
export function copyDemoPhotoFiles(uploadsRoot: string, now: number): void {
	const journalRoot = join(uploadsRoot, 'journal');
	rmSync(journalRoot, { recursive: true, force: true });
	for (const { filename, storageKey } of buildPhotoManifest(now)) {
		const src = join(ASSETS_DIR, filename);
		const dest = join(uploadsRoot, storageKey);
		if (!existsSync(src)) continue;
		mkdirSync(dirname(dest), { recursive: true });
		copyFileSync(src, dest);
	}
}
