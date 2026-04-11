-- Add logged_by FK to journal_photos with ON DELETE SET NULL.
-- SQLite ALTER TABLE ADD COLUMN cannot express ON DELETE clauses,
-- so recreate the table with the correct constraint.

CREATE TABLE `journal_photos_new` (
	`id` text PRIMARY KEY NOT NULL,
	`entry_id` text NOT NULL,
	`filename` text NOT NULL,
	`original_name` text,
	`mime_type` text NOT NULL,
	`size_bytes` integer NOT NULL,
	`notes` text,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`logged_by` text,
	FOREIGN KEY (`entry_id`) REFERENCES `journal_entries`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`logged_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);--> statement-breakpoint
INSERT INTO `journal_photos_new` (`id`, `entry_id`, `filename`, `original_name`, `mime_type`, `size_bytes`, `notes`, `created_at`)
	SELECT `id`, `entry_id`, `filename`, `original_name`, `mime_type`, `size_bytes`, `notes`, `created_at` FROM `journal_photos`;--> statement-breakpoint
DROP TABLE `journal_photos`;--> statement-breakpoint
ALTER TABLE `journal_photos_new` RENAME TO `journal_photos`;--> statement-breakpoint
CREATE INDEX `photo_entry_idx` ON `journal_photos` (`entry_id`);
