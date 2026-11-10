import { describe, it, expect } from 'vitest';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { DRIZZLE_DIR, migrateThrough } from './migrate-through';

function indexRows(sqlite: Database.Database) {
	return sqlite
		.prepare(
			`SELECT entity_type, entity_id, companion_id, title, body, event_date FROM search_index
			 WHERE entity_type IN ('medication', 'supply') ORDER BY entity_type, entity_id, companion_id`
		)
		.all();
}

describe('medication and supply search migration', () => {
	it('backfills existing medications and one row per supply link, then keeps them current', () => {
		const sqlite = new Database(':memory:');
		sqlite.pragma('foreign_keys = ON');
		migrateThrough(sqlite, '0043_cheerful_maverick');
		sqlite.prepare("INSERT INTO companions (id, name) VALUES ('c1', 'Rex'), ('c2', 'Bea')").run();
		sqlite
			.prepare(
				`INSERT INTO medications (id, companion_id, name, dose, instructions, started_on) VALUES
				 ('m1', 'c1', 'Pill', '5 mg', 'with food', '2026-11-01'),
				 ('m2', 'c2', 'Drops', NULL, NULL, '2026-10-01')`
			)
			.run();
		// 2026-11-09 12:00 UTC; the expected local day comes from SQLite itself.
		sqlite
			.prepare(
				`INSERT INTO supplies (id, name, kind, notes, created_at) VALUES
				 ('s1', 'Tablets', 'counted', 'blue box', 1794225600),
				 ('s2', 'Unlinked', 'counted', NULL, 1794225600)`
			)
			.run();
		sqlite.prepare("INSERT INTO supply_companions VALUES ('s1', 'c1'), ('s1', 'c2')").run();

		migrate(drizzle(sqlite), { migrationsFolder: DRIZZLE_DIR });
		const createdDay = (
			sqlite.prepare("SELECT date(1794225600, 'unixepoch', 'localtime') AS d").get() as {
				d: string;
			}
		).d;

		expect(indexRows(sqlite)).toEqual([
			{
				entity_type: 'medication',
				entity_id: 'm1',
				companion_id: 'c1',
				title: 'Pill',
				body: '5 mg with food',
				event_date: '2026-11-01'
			},
			{
				entity_type: 'medication',
				entity_id: 'm2',
				companion_id: 'c2',
				title: 'Drops',
				body: '',
				event_date: '2026-10-01'
			},
			{
				entity_type: 'supply',
				entity_id: 's1',
				companion_id: 'c1',
				title: 'Tablets',
				body: 'blue box',
				event_date: createdDay
			},
			{
				entity_type: 'supply',
				entity_id: 's1',
				companion_id: 'c2',
				title: 'Tablets',
				body: 'blue box',
				event_date: createdDay
			}
		]);

		// The triggers take over from here.
		sqlite.prepare("DELETE FROM supply_companions WHERE companion_id = 'c2'").run();
		sqlite.prepare("DELETE FROM medications WHERE id = 'm2'").run();
		expect(indexRows(sqlite)).toMatchObject([
			{ entity_id: 'm1' },
			{ entity_id: 's1', companion_id: 'c1' }
		]);
		sqlite.close();
	});

	it('indexes a link written before its supply, and follows a moved link', () => {
		const sqlite = new Database(':memory:');
		migrate(drizzle(sqlite), { migrationsFolder: DRIZZLE_DIR });
		sqlite.pragma('foreign_keys = OFF');
		sqlite.prepare("INSERT INTO companions (id, name) VALUES ('c1', 'Rex'), ('c2', 'Bea')").run();
		sqlite.prepare("INSERT INTO supply_companions VALUES ('s1', 'c1')").run();
		sqlite
			.prepare("INSERT INTO supplies (id, name, kind) VALUES ('s1', 'Tablets', 'counted')")
			.run();
		expect(indexRows(sqlite)).toMatchObject([{ entity_id: 's1', companion_id: 'c1' }]);

		sqlite.prepare("UPDATE supply_companions SET companion_id = 'c2' WHERE supply_id = 's1'").run();
		expect(indexRows(sqlite)).toMatchObject([{ entity_id: 's1', companion_id: 'c2' }]);
		expect(indexRows(sqlite)).toHaveLength(1);
		sqlite.close();
	});

	it('a fresh install has the triggers and no medication or supply rows', () => {
		const sqlite = new Database(':memory:');
		sqlite.pragma('foreign_keys = ON');
		migrate(drizzle(sqlite), { migrationsFolder: DRIZZLE_DIR });
		const triggers = sqlite
			.prepare(
				"SELECT name FROM sqlite_master WHERE type = 'trigger' AND (name LIKE 'search_medication_%' OR name LIKE 'search_supply_%') ORDER BY name"
			)
			.all()
			.map((r) => (r as { name: string }).name);
		expect(triggers).toEqual([
			'search_medication_ad',
			'search_medication_ai',
			'search_medication_au',
			'search_supply_ad',
			'search_supply_ai',
			'search_supply_au',
			'search_supply_link_ad',
			'search_supply_link_ai',
			'search_supply_link_au'
		]);
		expect(indexRows(sqlite)).toEqual([]);
		sqlite.close();
	});
});
