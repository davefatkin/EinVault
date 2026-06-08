CREATE TABLE `documents` (
	`id` text PRIMARY KEY NOT NULL,
	`companion_id` text NOT NULL,
	`health_event_id` text,
	`filename` text NOT NULL,
	`provider` text DEFAULT 'local' NOT NULL,
	`storage_key` text NOT NULL,
	`title` text NOT NULL,
	`category` text DEFAULT 'other' NOT NULL,
	`document_date` text,
	`original_name` text,
	`mime_type` text NOT NULL,
	`size_bytes` integer,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`uploaded_by` text,
	FOREIGN KEY (`companion_id`) REFERENCES `companions`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`health_event_id`) REFERENCES `health_events`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`uploaded_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `document_companion_idx` ON `documents` (`companion_id`);--> statement-breakpoint
CREATE INDEX `document_health_event_idx` ON `documents` (`health_event_id`);