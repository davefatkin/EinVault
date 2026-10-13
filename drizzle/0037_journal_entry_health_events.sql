CREATE TABLE `journal_entry_health_events` (
	`entry_id` text NOT NULL,
	`health_event_id` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	PRIMARY KEY(`entry_id`, `health_event_id`),
	FOREIGN KEY (`entry_id`) REFERENCES `journal_entries`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`health_event_id`) REFERENCES `health_events`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `journal_entry_health_event_idx` ON `journal_entry_health_events` (`health_event_id`);