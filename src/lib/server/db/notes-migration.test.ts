import { describe, it, expect } from 'vitest';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { DRIZZLE_DIR, migrateThrough } from './migrate-through';

const LAST_PRE_NOTES_TAG = '0030_striped_captain_flint';

describe('notes_sitter_migration', () => {
	it('turns non-blank notes_for_sitter into one shared, searchable note and clears the column', () => {
		const sqlite = new Database(':memory:');
		sqlite.pragma('foreign_keys = ON');
		migrateThrough(sqlite, LAST_PRE_NOTES_TAG);

		const insert = sqlite.prepare(
			'INSERT INTO companions (id, name, notes_for_sitter) VALUES (?, ?, ?)'
		);
		insert.run('c-text', 'Rex', 'Hand signals work best. Favorite treat is sardines.');
		insert.run('c-empty', 'Bo', '');
		insert.run('c-space', 'Cy', '  \n ');
		insert.run('c-null', 'Di', null);

		migrate(drizzle(sqlite), { migrationsFolder: DRIZZLE_DIR });

		const notes = sqlite.prepare('SELECT * FROM notes').all() as Record<string, unknown>[];
		expect(notes).toHaveLength(1);
		expect(notes[0]).toMatchObject({
			companion_id: 'c-text',
			title: 'Notes for sitter',
			body: 'Hand signals work best. Favorite treat is sardines.',
			shared_with_caretakers: 1,
			pinned: 0,
			logged_by: null,
			updated_by: null
		});

		const leftover = sqlite
			.prepare('SELECT count(*) AS n FROM companions WHERE notes_for_sitter IS NOT NULL')
			.get() as { n: number };
		expect(leftover.n).toBe(0);

		const hits = sqlite
			.prepare(
				"SELECT entity_id FROM search_index WHERE search_index MATCH ? AND entity_type = 'note'"
			)
			.all('"sardines"');
		expect(hits).toEqual([{ entity_id: notes[0].id }]);
		sqlite.close();
	});
});
