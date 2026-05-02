ALTER TABLE `sessions` ADD `oidc_id_token_hint` text;--> statement-breakpoint
ALTER TABLE `users` ADD `oidc_subject` text;--> statement-breakpoint
ALTER TABLE `users` ADD `oidc_issuer` text;--> statement-breakpoint
CREATE UNIQUE INDEX `users_oidc_idx` ON `users` (`oidc_issuer`,`oidc_subject`);