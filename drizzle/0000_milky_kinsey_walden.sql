CREATE TABLE `caretaker_shifts` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`start_at` integer NOT NULL,
	`end_at` integer NOT NULL,
	`notes` text,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `shift_user_idx` ON `caretaker_shifts` (`user_id`);--> statement-breakpoint
CREATE TABLE `companion_caretakers` (
	`companion_id` text NOT NULL,
	`user_id` text NOT NULL,
	PRIMARY KEY(`companion_id`, `user_id`),
	FOREIGN KEY (`companion_id`) REFERENCES `companions`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `companions` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`species` text DEFAULT 'dog' NOT NULL,
	`breed` text,
	`dob` text,
	`sex` text,
	`weight_unit` text DEFAULT 'lbs' NOT NULL,
	`microchip` text,
	`avatar_path` text,
	`bio` text,
	`feeding_schedule` text,
	`walk_schedule` text,
	`emergency_contact_name` text,
	`emergency_contact_phone` text,
	`vet_name` text,
	`vet_phone` text,
	`vet_clinic` text,
	`notes_for_sitter` text,
	`is_active` integer DEFAULT true NOT NULL,
	`archived_at` integer,
	`archive_note` text,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `companion_active_idx` ON `companions` (`is_active`);--> statement-breakpoint
CREATE TABLE `daily_events` (
	`id` text PRIMARY KEY NOT NULL,
	`companion_id` text NOT NULL,
	`type` text NOT NULL,
	`notes` text,
	`duration_minutes` integer,
	`logged_at` integer NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`logged_by` text,
	FOREIGN KEY (`companion_id`) REFERENCES `companions`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`logged_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `daily_companion_idx` ON `daily_events` (`companion_id`);--> statement-breakpoint
CREATE INDEX `daily_logged_idx` ON `daily_events` (`logged_at`);--> statement-breakpoint
CREATE TABLE `health_events` (
	`id` text PRIMARY KEY NOT NULL,
	`companion_id` text NOT NULL,
	`type` text NOT NULL,
	`title` text NOT NULL,
	`notes` text,
	`occurred_at` integer NOT NULL,
	`next_due_at` integer,
	`vet_name` text,
	`vet_clinic` text,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`companion_id`) REFERENCES `companions`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `health_companion_idx` ON `health_events` (`companion_id`);--> statement-breakpoint
CREATE INDEX `health_type_idx` ON `health_events` (`type`);--> statement-breakpoint
CREATE TABLE `journal_entries` (
	`id` text PRIMARY KEY NOT NULL,
	`companion_id` text NOT NULL,
	`date` text NOT NULL,
	`body` text DEFAULT '' NOT NULL,
	`mood` text,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL,
	`logged_by` text,
	FOREIGN KEY (`companion_id`) REFERENCES `companions`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`logged_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `journal_companion_date_idx` ON `journal_entries` (`companion_id`,`date`);--> statement-breakpoint
CREATE TABLE `journal_photos` (
	`id` text PRIMARY KEY NOT NULL,
	`entry_id` text NOT NULL,
	`filename` text NOT NULL,
	`original_name` text,
	`mime_type` text NOT NULL,
	`size_bytes` integer NOT NULL,
	`notes` text,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`entry_id`) REFERENCES `journal_entries`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `photo_entry_idx` ON `journal_photos` (`entry_id`);--> statement-breakpoint
CREATE TABLE `reminders` (
	`id` text PRIMARY KEY NOT NULL,
	`companion_id` text NOT NULL,
	`title` text NOT NULL,
	`description` text,
	`type` text NOT NULL,
	`due_at` integer NOT NULL,
	`is_recurring` integer DEFAULT false NOT NULL,
	`recurring_days` integer,
	`is_dismissed` integer DEFAULT false NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`companion_id`) REFERENCES `companions`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `reminder_companion_idx` ON `reminders` (`companion_id`);--> statement-breakpoint
CREATE INDEX `reminder_due_idx` ON `reminders` (`due_at`);--> statement-breakpoint
CREATE TABLE `sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`expires_at` integer NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `session_user_idx` ON `sessions` (`user_id`);--> statement-breakpoint
CREATE TABLE `users` (
	`id` text PRIMARY KEY NOT NULL,
	`username` text NOT NULL,
	`display_name` text NOT NULL,
	`password_hash` text,
	`role` text DEFAULT 'member' NOT NULL,
	`is_active` integer DEFAULT true NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`last_login_at` integer,
	`theme` text DEFAULT 'system' NOT NULL,
	`email` text,
	`phone` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_username_unique` ON `users` (`username`);--> statement-breakpoint
CREATE TABLE `weight_entries` (
	`id` text PRIMARY KEY NOT NULL,
	`companion_id` text NOT NULL,
	`weight` real NOT NULL,
	`unit` text NOT NULL,
	`recorded_at` integer NOT NULL,
	`notes` text,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`companion_id`) REFERENCES `companions`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `weight_companion_idx` ON `weight_entries` (`companion_id`);