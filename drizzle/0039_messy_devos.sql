CREATE TABLE `health_event_links` (
	`incident_id` text NOT NULL,
	`health_event_id` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	PRIMARY KEY(`incident_id`, `health_event_id`),
	FOREIGN KEY (`incident_id`) REFERENCES `health_events`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`health_event_id`) REFERENCES `health_events`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "health_event_links_distinct" CHECK(incident_id <> health_event_id)
);
--> statement-breakpoint
CREATE INDEX `health_event_link_event_idx` ON `health_event_links` (`health_event_id`);--> statement-breakpoint
CREATE TABLE `health_event_updates` (
	`id` text PRIMARY KEY NOT NULL,
	`health_event_id` text NOT NULL,
	`body` text NOT NULL,
	`severity` text,
	`occurred_at` integer NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`logged_by` text,
	FOREIGN KEY (`health_event_id`) REFERENCES `health_events`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`logged_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `health_event_update_idx` ON `health_event_updates` (`health_event_id`,`occurred_at`);--> statement-breakpoint
ALTER TABLE `health_events` ADD `severity` text;--> statement-breakpoint
ALTER TABLE `health_events` ADD `resolved_at` integer;--> statement-breakpoint
ALTER TABLE `media` ADD `update_id` text REFERENCES health_event_updates(id) ON UPDATE no action ON DELETE cascade;--> statement-breakpoint
CREATE INDEX `media_update_idx` ON `media` (`update_id`,`created_at`);--> statement-breakpoint
ALTER TABLE `users` ADD `notify_incident_email` integer DEFAULT true NOT NULL;--> statement-breakpoint
-- Update bodies are searchable. title stays empty (the palette hides empty
-- titles; the incident title would go stale on rename). Not modeled by
-- drizzle-kit, so appended by hand as 0035 did.
CREATE TRIGGER search_incident_update_ai AFTER INSERT ON health_event_updates BEGIN
	INSERT INTO search_index (title, body, entity_type, entity_id, companion_id, event_date)
	SELECT '', new.body, 'incident_update', new.id, he.companion_id,
		date(new.occurred_at, 'unixepoch', 'localtime')
	FROM health_events he WHERE he.id = new.health_event_id;
END;
--> statement-breakpoint
CREATE TRIGGER search_incident_update_au AFTER UPDATE ON health_event_updates BEGIN
	DELETE FROM search_index WHERE entity_type = 'incident_update' AND entity_id = old.id;
	INSERT INTO search_index (title, body, entity_type, entity_id, companion_id, event_date)
	SELECT '', new.body, 'incident_update', new.id, he.companion_id,
		date(new.occurred_at, 'unixepoch', 'localtime')
	FROM health_events he WHERE he.id = new.health_event_id;
END;
--> statement-breakpoint
CREATE TRIGGER search_incident_update_ad AFTER DELETE ON health_event_updates BEGIN
	DELETE FROM search_index WHERE entity_type = 'incident_update' AND entity_id = old.id;
END;
