ALTER TABLE `reminders` ADD `series_id` text;--> statement-breakpoint
ALTER TABLE `reminders` ADD `completed_at` integer;--> statement-breakpoint
ALTER TABLE `reminders` ADD `completed_by` text REFERENCES users(id);--> statement-breakpoint
CREATE INDEX `reminder_series_due_idx` ON `reminders` (`series_id`,`due_at`);--> statement-breakpoint
ALTER TABLE `reminders` DROP COLUMN `is_dismissed`;