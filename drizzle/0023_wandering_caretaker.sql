ALTER TABLE `users` ADD `calendar_feed_token` text;--> statement-breakpoint
CREATE UNIQUE INDEX `users_calendar_feed_token_idx` ON `users` (`calendar_feed_token`);