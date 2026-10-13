CREATE TABLE `media` (
	`id` text PRIMARY KEY NOT NULL,
	`entry_id` text,
	`note_id` text,
	`health_event_id` text,
	`filename` text NOT NULL,
	`provider` text DEFAULT 'local' NOT NULL,
	`storage_key` text,
	`original_name` text,
	`media_type` text DEFAULT 'photo' NOT NULL,
	`mime_type` text NOT NULL,
	`size_bytes` integer NOT NULL,
	`caption` text,
	`status` text DEFAULT 'ready' NOT NULL,
	`original_key` text,
	`poster_key` text,
	`transcode_attempts` integer DEFAULT 0 NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`logged_by` text,
	FOREIGN KEY (`entry_id`) REFERENCES `journal_entries`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`note_id`) REFERENCES `notes`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`health_event_id`) REFERENCES `health_events`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`logged_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "media_one_parent" CHECK((entry_id IS NOT NULL) + (note_id IS NOT NULL) + (health_event_id IS NOT NULL) = 1)
);
--> statement-breakpoint
CREATE INDEX `media_entry_idx` ON `media` (`entry_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `media_note_idx` ON `media` (`note_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `media_health_event_idx` ON `media` (`health_event_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `media_status_idx` ON `media` (`status`,`created_at`);--> statement-breakpoint
DROP TRIGGER search_media_ai;
--> statement-breakpoint
DROP TRIGGER search_media_au;
--> statement-breakpoint
DROP TRIGGER search_media_ad;
--> statement-breakpoint
-- Orphans (parent gone) are unreachable and would fail the FK, so they are
-- skipped. A logged_by pointing at a deleted user becomes NULL.
INSERT INTO media (id, entry_id, filename, provider, storage_key, original_name, media_type,
	mime_type, size_bytes, caption, status, original_key, poster_key, transcode_attempts,
	created_at, logged_by)
SELECT id, entry_id, filename, provider, storage_key, original_name, media_type,
	mime_type, size_bytes, notes, status, original_key, poster_key, transcode_attempts,
	created_at, CASE WHEN logged_by IN (SELECT id FROM users) THEN logged_by END
FROM journal_photos
WHERE entry_id IN (SELECT id FROM journal_entries);
--> statement-breakpoint
INSERT INTO media (id, note_id, filename, provider, storage_key, original_name, media_type,
	mime_type, size_bytes, caption, status, original_key, poster_key, transcode_attempts,
	created_at, logged_by)
SELECT id, note_id, filename, provider, storage_key, original_name, media_type,
	mime_type, size_bytes, caption, status, original_key, poster_key, transcode_attempts,
	created_at, CASE WHEN logged_by IN (SELECT id FROM users) THEN logged_by END
FROM note_media
WHERE note_id IN (SELECT id FROM notes);
--> statement-breakpoint
-- Created after the copy so copied rows keep their existing search_index rows
-- instead of gaining a second one. Only journal media is indexed: the join
-- matches nothing for note or health event media.
CREATE TRIGGER search_media_ai AFTER INSERT ON media BEGIN
	INSERT INTO search_index (title, body, entity_type, entity_id, companion_id, event_date)
	SELECT '', COALESCE(new.caption, ''), 'media', new.id, je.companion_id, je.date
	FROM journal_entries je WHERE je.id = new.entry_id;
END;
--> statement-breakpoint
-- No WHEN clause: a row moved off entry_id must still lose its search row.
CREATE TRIGGER search_media_au AFTER UPDATE ON media BEGIN
	DELETE FROM search_index WHERE entity_type = 'media' AND entity_id = old.id;
	INSERT INTO search_index (title, body, entity_type, entity_id, companion_id, event_date)
	SELECT '', COALESCE(new.caption, ''), 'media', new.id, je.companion_id, je.date
	FROM journal_entries je WHERE je.id = new.entry_id;
END;
--> statement-breakpoint
CREATE TRIGGER search_media_ad AFTER DELETE ON media BEGIN
	DELETE FROM search_index WHERE entity_type = 'media' AND entity_id = old.id;
END;
