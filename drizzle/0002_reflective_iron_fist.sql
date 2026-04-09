ALTER TABLE `health_events` ADD `logged_by` text REFERENCES users(id);--> statement-breakpoint
ALTER TABLE `reminders` ADD `logged_by` text REFERENCES users(id);--> statement-breakpoint
ALTER TABLE `weight_entries` ADD `logged_by` text REFERENCES users(id);