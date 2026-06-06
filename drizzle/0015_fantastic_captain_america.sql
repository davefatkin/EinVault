UPDATE `users` SET `email` = lower(trim(`email`)) WHERE `email` IS NOT NULL;--> statement-breakpoint
UPDATE `users` SET `email` = NULL WHERE `email` = '';--> statement-breakpoint
UPDATE `users` SET `email` = NULL WHERE `email` IS NOT NULL AND `id` NOT IN (
	SELECT `id` FROM (
		SELECT `id`, ROW_NUMBER() OVER (PARTITION BY `email` ORDER BY `created_at`, `id`) AS `rn`
		FROM `users` WHERE `email` IS NOT NULL
	) WHERE `rn` = 1
);--> statement-breakpoint
CREATE UNIQUE INDEX `users_email_idx` ON `users` (`email`);
