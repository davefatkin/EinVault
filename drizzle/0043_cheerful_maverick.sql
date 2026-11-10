CREATE TABLE `supplies` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`kind` text NOT NULL,
	`unit` text,
	`quantity` real,
	`low_stock_at` real,
	`lasts_days` integer,
	`stocked_on` text,
	`expires_on` text,
	`alerts_enabled` integer DEFAULT true NOT NULL,
	`run_out_lead_days` text DEFAULT '7',
	`expiry_lead_days` text DEFAULT '14',
	`stock_version` text DEFAULT (lower(hex(randomblob(8)))) NOT NULL,
	`run_out_alerted` text,
	`low_alerted` text,
	`expiry_alerted` text,
	`notes` text,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`created_by` text,
	FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE TABLE `supply_companions` (
	`supply_id` text NOT NULL,
	`companion_id` text NOT NULL,
	PRIMARY KEY(`supply_id`, `companion_id`),
	FOREIGN KEY (`supply_id`) REFERENCES `supplies`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`companion_id`) REFERENCES `companions`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `supply_events` (
	`id` text PRIMARY KEY NOT NULL,
	`supply_id` text NOT NULL,
	`type` text NOT NULL,
	`at` integer NOT NULL,
	`quantity_delta` real,
	`dose_id` text,
	`companion_id` text,
	`cost_minor` integer,
	`currency` text,
	`document_id` text,
	`note` text,
	`created_by` text,
	FOREIGN KEY (`supply_id`) REFERENCES `supplies`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`dose_id`) REFERENCES `medication_doses`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`companion_id`) REFERENCES `companions`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`document_id`) REFERENCES `documents`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `supply_event_supply_at_idx` ON `supply_events` (`supply_id`,`at`);--> statement-breakpoint
CREATE UNIQUE INDEX `supply_event_dose_uniq` ON `supply_events` (`dose_id`);--> statement-breakpoint
ALTER TABLE `app_settings` ADD `currency` text DEFAULT 'USD' NOT NULL;--> statement-breakpoint
ALTER TABLE `medications` ADD `supply_id` text REFERENCES supplies(id) ON UPDATE no action ON DELETE set null;--> statement-breakpoint
ALTER TABLE `medications` ADD `dose_units` real DEFAULT 1 NOT NULL;