-- Fix logged_by foreign keys to include ON DELETE SET NULL.
-- SQLite ALTER TABLE ADD COLUMN cannot express ON DELETE clauses,
-- so we recreate the three affected tables with the correct constraint.

-- health_events
CREATE TABLE `health_events_new` (
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
	`logged_by` text,
	FOREIGN KEY (`companion_id`) REFERENCES `companions`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`logged_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);--> statement-breakpoint
INSERT INTO `health_events_new` SELECT * FROM `health_events`;--> statement-breakpoint
DROP TABLE `health_events`;--> statement-breakpoint
ALTER TABLE `health_events_new` RENAME TO `health_events`;--> statement-breakpoint
CREATE INDEX `health_companion_idx` ON `health_events` (`companion_id`);--> statement-breakpoint
CREATE INDEX `health_type_idx` ON `health_events` (`type`);--> statement-breakpoint

-- weight_entries
CREATE TABLE `weight_entries_new` (
	`id` text PRIMARY KEY NOT NULL,
	`companion_id` text NOT NULL,
	`weight` real NOT NULL,
	`unit` text NOT NULL,
	`recorded_at` integer NOT NULL,
	`notes` text,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`logged_by` text,
	FOREIGN KEY (`companion_id`) REFERENCES `companions`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`logged_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);--> statement-breakpoint
INSERT INTO `weight_entries_new` SELECT * FROM `weight_entries`;--> statement-breakpoint
DROP TABLE `weight_entries`;--> statement-breakpoint
ALTER TABLE `weight_entries_new` RENAME TO `weight_entries`;--> statement-breakpoint
CREATE INDEX `weight_companion_idx` ON `weight_entries` (`companion_id`);--> statement-breakpoint

-- reminders
CREATE TABLE `reminders_new` (
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
	`logged_by` text,
	FOREIGN KEY (`companion_id`) REFERENCES `companions`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`logged_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);--> statement-breakpoint
INSERT INTO `reminders_new` SELECT * FROM `reminders`;--> statement-breakpoint
DROP TABLE `reminders`;--> statement-breakpoint
ALTER TABLE `reminders_new` RENAME TO `reminders`;--> statement-breakpoint
CREATE INDEX `reminder_companion_idx` ON `reminders` (`companion_id`);--> statement-breakpoint
CREATE INDEX `reminder_due_idx` ON `reminders` (`due_at`);
