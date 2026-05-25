ALTER TABLE `companions` ADD `avatar_provider` text DEFAULT 'local' NOT NULL;--> statement-breakpoint
ALTER TABLE `companions` ADD `avatar_storage_key` text;--> statement-breakpoint
ALTER TABLE `journal_photos` ADD `provider` text DEFAULT 'local' NOT NULL;--> statement-breakpoint
ALTER TABLE `journal_photos` ADD `storage_key` text;