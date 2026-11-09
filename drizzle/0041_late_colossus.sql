CREATE TABLE `medication_doses` (
	`id` text PRIMARY KEY NOT NULL,
	`medication_id` text NOT NULL,
	`given_at` integer NOT NULL,
	`given_by` text,
	`reminder_id` text,
	`source` text NOT NULL,
	`note` text,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`medication_id`) REFERENCES `medications`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`given_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`reminder_id`) REFERENCES `reminders`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `medication_dose_given_idx` ON `medication_doses` (`medication_id`,`given_at`);--> statement-breakpoint
CREATE UNIQUE INDEX `medication_dose_reminder_uniq` ON `medication_doses` (`reminder_id`);--> statement-breakpoint
CREATE TABLE `medications` (
	`id` text PRIMARY KEY NOT NULL,
	`companion_id` text NOT NULL,
	`name` text NOT NULL,
	`dose` text,
	`instructions` text,
	`started_on` text NOT NULL,
	`ended_on` text,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`logged_by` text,
	FOREIGN KEY (`companion_id`) REFERENCES `companions`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`logged_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `medication_companion_ended_idx` ON `medications` (`companion_id`,`ended_on`);--> statement-breakpoint
ALTER TABLE `reminders` ADD `medication_id` text REFERENCES medications(id) ON UPDATE no action ON DELETE set null;--> statement-breakpoint
CREATE INDEX `reminder_medication_idx` ON `reminders` (`medication_id`);