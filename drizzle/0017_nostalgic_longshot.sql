CREATE TABLE `notification_outbox` (
	`id` text PRIMARY KEY NOT NULL,
	`dedupe_key` text NOT NULL,
	`user_id` text NOT NULL,
	`channel` text NOT NULL,
	`payload` text NOT NULL,
	`status` text DEFAULT 'queued' NOT NULL,
	`attempts` integer DEFAULT 0 NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`sent_at` integer,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `outbox_dedupe_idx` ON `notification_outbox` (`dedupe_key`);--> statement-breakpoint
CREATE INDEX `outbox_status_idx` ON `notification_outbox` (`status`);--> statement-breakpoint
ALTER TABLE `users` ADD `notify_reminder_email` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `users` ADD `notify_shift_email` integer DEFAULT false NOT NULL;