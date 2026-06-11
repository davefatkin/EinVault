CREATE TRIGGER search_media_ai AFTER INSERT ON journal_photos BEGIN
	INSERT INTO search_index (title, body, entity_type, entity_id, companion_id, event_date)
	SELECT '', COALESCE(new.notes, ''), 'media', new.id, je.companion_id, je.date
	FROM journal_entries je WHERE je.id = new.entry_id;
END;
--> statement-breakpoint
CREATE TRIGGER search_media_au AFTER UPDATE ON journal_photos BEGIN
	DELETE FROM search_index WHERE entity_type = 'media' AND entity_id = old.id;
	INSERT INTO search_index (title, body, entity_type, entity_id, companion_id, event_date)
	SELECT '', COALESCE(new.notes, ''), 'media', new.id, je.companion_id, je.date
	FROM journal_entries je WHERE je.id = new.entry_id;
END;
--> statement-breakpoint
CREATE TRIGGER search_media_ad AFTER DELETE ON journal_photos BEGIN
	DELETE FROM search_index WHERE entity_type = 'media' AND entity_id = old.id;
END;
--> statement-breakpoint
INSERT INTO search_index (title, body, entity_type, entity_id, companion_id, event_date)
SELECT '', COALESCE(jp.notes, ''), 'media', jp.id, je.companion_id, je.date
FROM journal_photos jp JOIN journal_entries je ON je.id = jp.entry_id;
