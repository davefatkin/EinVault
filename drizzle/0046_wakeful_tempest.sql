ALTER TABLE `users` ADD `getting_started` text DEFAULT 'auto' NOT NULL;--> statement-breakpoint
ALTER TABLE `users` ADD `getting_started_seen_at` integer;--> statement-breakpoint
ALTER TABLE `users` ADD `getting_started_completed_on` text;