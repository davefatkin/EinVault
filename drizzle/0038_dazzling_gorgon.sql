ALTER TABLE `companions` ADD `dob_approximate` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `companions` ADD `homecoming_date` text;--> statement-breakpoint
ALTER TABLE `users` ADD `notify_celebration_email` integer DEFAULT false NOT NULL;