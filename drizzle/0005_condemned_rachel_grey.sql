ALTER TABLE `reminders` ADD `series_id` text;--> statement-breakpoint
ALTER TABLE `reminders` ADD `completed_at` integer;--> statement-breakpoint
ALTER TABLE `reminders` ADD `completed_by` text REFERENCES users(id);--> statement-breakpoint
CREATE INDEX `reminder_series_due_idx` ON `reminders` (`series_id`,`due_at`);--> statement-breakpoint
-- Backfill: existing recurring reminders each become their own series origin.
-- Chains will self-heal and link properly on the next completion cycle.
UPDATE `reminders` SET `series_id` = `id` WHERE `is_recurring` = 1;--> statement-breakpoint
ALTER TABLE `reminders` DROP COLUMN `is_dismissed`;