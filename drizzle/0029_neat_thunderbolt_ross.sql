ALTER TABLE `reminders` ADD `outcome` text;
--> statement-breakpoint
UPDATE `reminders` SET `outcome` = 'completed' WHERE `completed_at` IS NOT NULL;