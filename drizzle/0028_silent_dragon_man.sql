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
ALTER TABLE `api_tokens` ADD `scope` text DEFAULT 'full' NOT NULL;--> statement-breakpoint
ALTER TABLE `api_tokens` ADD `expires_at` integer;