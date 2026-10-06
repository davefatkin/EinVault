CREATE TABLE `note_media` (
	`id` text PRIMARY KEY NOT NULL,
	`note_id` text NOT NULL,
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
	FOREIGN KEY (`note_id`) REFERENCES `notes`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`logged_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `note_media_note_idx` ON `note_media` (`note_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `note_media_status_idx` ON `note_media` (`status`);