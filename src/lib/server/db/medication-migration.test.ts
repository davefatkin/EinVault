import { describe, it, expect } from 'vitest';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { DRIZZLE_DIR, migrateThrough } from './migrate-through';

const LAST_PRE_MEDICATIONS_TAG = '0040_white_thundra';

function migratedDb() {
	const sqlite = new Database(':memory:');
	sqlite.pragma('foreign_keys = ON');
	migrateThrough(sqlite, LAST_PRE_MEDICATIONS_TAG);
	return sqlite;
}

describe('medication_schedule_migration', () => {
	it('moves non-blank medication_schedule into one medication and clears the column', () => {
		const sqlite = migratedDb();
		const insert = sqlite.prepare(
			'INSERT INTO companions (id, name, medication_schedule) VALUES (?, ?, ?)'
		);
		insert.run('c-text', 'Rex', '1 pill daily');
		insert.run('c-space', 'Cy', '  ');
		insert.run('c-null', 'Di', null);

		migrate(drizzle(sqlite), { migrationsFolder: DRIZZLE_DIR });

		const meds = sqlite.prepare('SELECT * FROM medications').all() as Record<string, unknown>[];
		expect(meds).toHaveLength(1);
		expect(meds[0]).toMatchObject({
			companion_id: 'c-text',
			name: 'Medication schedule',
			instructions: '1 pill daily',
			dose: null,
			ended_on: null,
			logged_by: null
		});
		expect(meds[0].started_on).toMatch(/^\d{4}-\d{2}-\d{2}$/);
		expect((meds[0].id as string).length).toBeGreaterThan(0);

		const leftover = sqlite
			.prepare('SELECT count(*) AS n FROM companions WHERE medication_schedule IS NOT NULL')
			.get() as { n: number };
		expect(leftover.n).toBe(0);
		sqlite.close();
	});
});

describe('medications foreign keys', () => {
	function setup() {
		const sqlite = migratedDb();
		migrate(drizzle(sqlite), { migrationsFolder: DRIZZLE_DIR });
		sqlite.prepare("INSERT INTO companions (id, name) VALUES ('c1', 'Rex')").run();
		sqlite
			.prepare(
				"INSERT INTO medications (id, companion_id, name, started_on) VALUES ('m1','c1','Pill','2026-11-09')"
			)
			.run();
		return sqlite;
	}
	const addReminder = (s: Database.Database, id: string, medId: string | null) =>
		s
			.prepare(
				"INSERT INTO reminders (id, companion_id, title, type, due_at, medication_id) VALUES (?, 'c1', 't', 'medication', 1, ?)"
			)
			.run(id, medId);
	const addDose = (s: Database.Database, id: string, reminderId: string | null) =>
		s
			.prepare(
				"INSERT INTO medication_doses (id, medication_id, given_at, reminder_id, source) VALUES (?, 'm1', 1, ?, 'manual')"
			)
			.run(id, reminderId);

	it('sets reminders.medication_id null when the medication is deleted', () => {
		const sqlite = setup();
		addReminder(sqlite, 'r1', 'm1');
		sqlite.prepare("DELETE FROM medications WHERE id = 'm1'").run();
		const row = sqlite.prepare("SELECT medication_id FROM reminders WHERE id = 'r1'").get() as {
			medication_id: string | null;
		};
		expect(row.medication_id).toBeNull();
		sqlite.close();
	});

	it('sets medication_doses.reminder_id null when the reminder is deleted', () => {
		const sqlite = setup();
		addReminder(sqlite, 'r1', 'm1');
		addDose(sqlite, 'd1', 'r1');
		sqlite.prepare("DELETE FROM reminders WHERE id = 'r1'").run();
		const row = sqlite
			.prepare("SELECT reminder_id FROM medication_doses WHERE id = 'd1'")
			.get() as {
			reminder_id: string | null;
		};
		expect(row.reminder_id).toBeNull();
		sqlite.close();
	});

	it('cascades doses when the medication is deleted', () => {
		const sqlite = setup();
		addDose(sqlite, 'd1', null);
		sqlite.prepare("DELETE FROM medications WHERE id = 'm1'").run();
		expect(sqlite.prepare('SELECT count(*) AS n FROM medication_doses').get()).toEqual({ n: 0 });
		sqlite.close();
	});

	it('allows many null reminder_ids but rejects a repeated non-null one', () => {
		const sqlite = setup();
		addReminder(sqlite, 'r1', 'm1');
		addDose(sqlite, 'd1', null);
		addDose(sqlite, 'd2', null);
		addDose(sqlite, 'd3', 'r1');
		expect(() => addDose(sqlite, 'd4', 'r1')).toThrow(/UNIQUE/);
		sqlite.close();
	});
});
