CREATE TABLE `api_idempotency_keys` (
	`id` text PRIMARY KEY NOT NULL,
	`token_id` text NOT NULL,
	`endpoint` text NOT NULL,
	`key` text NOT NULL,
	`request_hash` text NOT NULL,
	`response_json` text NOT NULL,
	`status` integer NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`token_id`) REFERENCES `api_tokens`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `api_idem_token_endpoint_key_idx` ON `api_idempotency_keys` (`token_id`,`endpoint`,`key`);--> statement-breakpoint
CREATE TABLE `api_tokens` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`name` text NOT NULL,
	`token_hash` text NOT NULL,
	`scope` text DEFAULT 'full' NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`expires_at` integer,
	`last_used_at` integer,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `api_token_hash_idx` ON `api_tokens` (`token_hash`);--> statement-breakpoint
CREATE INDEX `api_token_user_idx` ON `api_tokens` (`user_id`);--> statement-breakpoint
CREATE TABLE `quick_log_companions` (
	`quick_log_id` text NOT NULL,
	`companion_id` text NOT NULL,
	PRIMARY KEY(`quick_log_id`, `companion_id`),
	FOREIGN KEY (`quick_log_id`) REFERENCES `quick_logs`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`companion_id`) REFERENCES `companions`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `quick_logs` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`name` text NOT NULL,
	`type` text NOT NULL,
	`duration_minutes` integer,
	`note` text,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`is_enabled` integer DEFAULT true NOT NULL,
	`remember_also` integer DEFAULT true NOT NULL,
	`last_companion_ids` text,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `quick_log_user_idx` ON `quick_logs` (`user_id`,`sort_order`);--> statement-breakpoint
ALTER TABLE `users` ADD `api_access_enabled` integer DEFAULT true NOT NULL;