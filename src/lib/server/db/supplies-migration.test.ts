import { describe, it, expect } from 'vitest';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { DRIZZLE_DIR, migrateThrough } from './migrate-through';

describe('supplies migration', () => {
	it('keeps existing medications unlinked with one unit per dose, and sets supply_id null on supply delete', () => {
		const sqlite = new Database(':memory:');
		sqlite.pragma('foreign_keys = ON');
		migrateThrough(sqlite, '0042_medication_schedule_migration');
		sqlite.prepare("INSERT INTO companions (id, name) VALUES ('c1', 'Rex')").run();
		sqlite
			.prepare(
				"INSERT INTO medications (id, companion_id, name, started_on) VALUES ('m1','c1','Pill','2026-11-09')"
			)
			.run();

		migrate(drizzle(sqlite), { migrationsFolder: DRIZZLE_DIR });

		const med = sqlite.prepare("SELECT supply_id, dose_units FROM medications WHERE id='m1'").get();
		expect(med).toEqual({ supply_id: null, dose_units: 1 });
		const settings = sqlite.prepare('SELECT currency FROM app_settings').all();
		expect(settings.every((r) => (r as { currency: string }).currency === 'USD')).toBe(true);

		sqlite
			.prepare(
				"INSERT INTO supplies (id, name, kind, quantity) VALUES ('s1','Tablets','counted',10)"
			)
			.run();
		const fresh = sqlite.prepare('SELECT stock_version, run_out_lead_days FROM supplies').get() as {
			stock_version: string;
			run_out_lead_days: string;
		};
		expect(fresh.stock_version.length).toBeGreaterThan(0);
		expect(fresh.run_out_lead_days).toBe('7');
		sqlite.prepare("UPDATE medications SET supply_id='s1', dose_units=0.5 WHERE id='m1'").run();
		sqlite.prepare("DELETE FROM supplies WHERE id='s1'").run();
		expect(
			sqlite.prepare("SELECT supply_id, dose_units FROM medications WHERE id='m1'").get()
		).toEqual({
			supply_id: null,
			dose_units: 0.5
		});
		sqlite.close();
	});

	it('cascades supply deletes to companions and events', () => {
		const sqlite = new Database(':memory:');
		sqlite.pragma('foreign_keys = ON');
		migrate(drizzle(sqlite), { migrationsFolder: DRIZZLE_DIR });
		sqlite.prepare("INSERT INTO companions (id, name) VALUES ('c1', 'Rex')").run();
		sqlite.prepare("INSERT INTO supplies (id, name, kind) VALUES ('s1','Tablets','counted')").run();
		sqlite.prepare("INSERT INTO supply_companions VALUES ('s1','c1')").run();
		sqlite
			.prepare(
				"INSERT INTO supply_events (id, supply_id, type, at) VALUES ('e1','s1','purchase',0)"
			)
			.run();
		sqlite.prepare("DELETE FROM supplies WHERE id='s1'").run();
		expect(sqlite.prepare('SELECT count(*) n FROM supply_companions').get()).toEqual({ n: 0 });
		expect(sqlite.prepare('SELECT count(*) n FROM supply_events').get()).toEqual({ n: 0 });
		sqlite.close();
	});
});
