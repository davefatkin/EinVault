import { describe, it, expect } from 'vitest';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { DRIZZLE_DIR, migrateThrough } from './migrate-through';

const LAST_PRE_MEDIA_TAG = '0034_note_media';

function dbAtPreMedia() {
	const sqlite = new Database(':memory:');
	sqlite.pragma('foreign_keys = ON');
	migrateThrough(sqlite, LAST_PRE_MEDIA_TAG);
	sqlite.exec(`
		INSERT INTO users (id, username, display_name, role) VALUES ('u1', 'jet', 'Jet', 'member');
		INSERT INTO companions (id, name) VALUES ('c1', 'Ein');
		INSERT INTO journal_entries (id, companion_id, date) VALUES ('e1', 'c1', '2026-05-01');
		INSERT INTO notes (id, companion_id, title) VALUES ('n1', 'c1', 'Tricks');
	`);
	const jp = sqlite.prepare(`INSERT INTO journal_photos (id, entry_id, filename, provider,
		storage_key, media_type, mime_type, size_bytes, notes, status, transcode_attempts,
		created_at, logged_by) VALUES (?, ?, ?, 'local', ?, ?, ?, 10, ?, ?, ?, 1000, ?)`);
	jp.run(
		'jp-1',
		'e1',
		'jp-1.jpg',
		'journal/c1/2026-05-01/jp-1.jpg',
		'photo',
		'image/jpeg',
		'paw print',
		'ready',
		0,
		'u1'
	);
	jp.run(
		'jp-proc',
		'e1',
		'jp-proc.orig.mov',
		'journal/c1/2026-05-01/jp-proc.orig.mov',
		'video',
		'video/quicktime',
		null,
		'processing',
		1,
		'u1'
	);
	jp.run(
		'jp-claimed',
		'e1',
		'jp-claimed.orig.mov',
		'journal/c1/2026-05-01/jp-claimed.orig.mov',
		'video',
		'video/quicktime',
		null,
		'claimed',
		2,
		null
	);
	jp.run(
		'jp-failed',
		'e1',
		'jp-failed.orig.mov',
		'journal/c1/2026-05-01/jp-failed.orig.mov',
		'video',
		'video/quicktime',
		null,
		'failed',
		4,
		null
	);
	jp.run('jp-legacy', 'e1', 'jp-legacy.jpg', null, 'photo', 'image/jpeg', null, 'ready', 0, null);
	sqlite
		.prepare(
			`INSERT INTO note_media (id, note_id, filename, provider, storage_key, media_type,
			mime_type, size_bytes, caption, created_at, logged_by)
			VALUES ('nm-1', 'n1', 'nm-1.jpg', 's3', 'notes/c1/n1/nm-1.jpg', 'photo', 'image/jpeg', 10,
			'sit trick', 1000, 'u1')`
		)
		.run();

	// Rows that can't exist with foreign keys on, but may on old installs.
	sqlite.pragma('foreign_keys = OFF');
	jp.run(
		'jp-orphan',
		'gone',
		'o.jpg',
		'journal/c1/x/o.jpg',
		'photo',
		'image/jpeg',
		null,
		'ready',
		0,
		null
	);
	jp.run(
		'jp-ghost',
		'e1',
		'g.jpg',
		'journal/c1/2026-05-01/g.jpg',
		'photo',
		'image/jpeg',
		null,
		'ready',
		0,
		'ghost'
	);
	sqlite
		.prepare(
			`INSERT INTO note_media (id, note_id, filename, storage_key, mime_type, size_bytes)
			VALUES ('nm-orphan', 'gone', 'o.jpg', 'notes/c1/gone/o.jpg', 'image/jpeg', 10)`
		)
		.run();
	sqlite.pragma('foreign_keys = ON');
	return sqlite;
}

function migrateAll(sqlite: Database.Database) {
	migrate(drizzle(sqlite), { migrationsFolder: DRIZZLE_DIR });
}

type Row = Record<string, unknown>;

describe('media_table migration', () => {
	it('copies journal and note media with ids, parents, captions and status', () => {
		const sqlite = dbAtPreMedia();
		migrateAll(sqlite);
		const rows = sqlite.prepare('SELECT * FROM media ORDER BY id').all() as Row[];
		const byId = new Map(rows.map((r) => [r.id, r]));

		expect([...byId.keys()].sort()).toEqual(
			['jp-1', 'jp-claimed', 'jp-failed', 'jp-ghost', 'jp-legacy', 'jp-proc', 'nm-1'].sort()
		);
		expect(byId.get('jp-1')).toMatchObject({
			entry_id: 'e1',
			note_id: null,
			health_event_id: null,
			caption: 'paw print',
			storage_key: 'journal/c1/2026-05-01/jp-1.jpg',
			logged_by: 'u1',
			created_at: 1000
		});
		expect(byId.get('nm-1')).toMatchObject({
			entry_id: null,
			note_id: 'n1',
			provider: 's3',
			caption: 'sit trick'
		});
		expect(byId.get('jp-proc')).toMatchObject({ status: 'processing', transcode_attempts: 1 });
		expect(byId.get('jp-claimed')?.status).toBe('claimed');
		expect(byId.get('jp-failed')).toMatchObject({ status: 'failed', transcode_attempts: 4 });
		expect(byId.get('jp-legacy')?.storage_key).toBeNull();
		sqlite.close();
	});

	it('skips orphans and nulls a dangling logged_by', () => {
		const sqlite = dbAtPreMedia();
		migrateAll(sqlite);
		const ids = (sqlite.prepare('SELECT id FROM media').all() as Row[]).map((r) => r.id);
		expect(ids).not.toContain('jp-orphan');
		expect(ids).not.toContain('nm-orphan');
		const ghost = sqlite.prepare("SELECT logged_by FROM media WHERE id = 'jp-ghost'").get() as Row;
		expect(ghost.logged_by).toBeNull();
		expect(sqlite.pragma('foreign_key_check(media)')).toEqual([]);
		sqlite.close();
	});

	it('keeps exactly one search row per copied journal photo and moves the triggers', () => {
		const sqlite = dbAtPreMedia();
		migrateAll(sqlite);
		const n = sqlite
			.prepare(
				"SELECT count(*) AS n FROM search_index WHERE entity_type = 'media' AND entity_id = 'jp-1'"
			)
			.get() as { n: number };
		expect(n.n).toBe(1);

		const triggers = (
			sqlite
				.prepare(
					"SELECT name FROM sqlite_master WHERE type = 'trigger' AND tbl_name = 'media' ORDER BY name"
				)
				.all() as Row[]
		).map((r) => r.name);
		expect(triggers).toEqual(['search_media_ad', 'search_media_ai', 'search_media_au']);

		sqlite.prepare("UPDATE media SET caption = 'marmot' WHERE id = 'jp-1'").run();
		const hits = sqlite
			.prepare(
				"SELECT entity_id FROM search_index WHERE search_index MATCH ? AND entity_type = 'media'"
			)
			.all('"marmot"');
		expect(hits).toEqual([{ entity_id: 'jp-1' }]);
		sqlite.close();
	});
});
