ALTER TABLE `journal_photos` ADD `status` text DEFAULT 'ready' NOT NULL;--> statement-breakpoint
ALTER TABLE `journal_photos` ADD `original_key` text;--> statement-breakpoint
ALTER TABLE `journal_photos` ADD `poster_key` text;--> statement-breakpoint
ALTER TABLE `journal_photos` ADD `transcode_attempts` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
CREATE INDEX `photo_status_idx` ON `journal_photos` (`status`);