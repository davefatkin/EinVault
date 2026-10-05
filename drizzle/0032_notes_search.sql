CREATE TRIGGER search_note_ai AFTER INSERT ON notes BEGIN
	INSERT INTO search_index (title, body, entity_type, entity_id, companion_id, event_date)
	VALUES (
		new.title,
		COALESCE(new.body, '') || ' ' || COALESCE((SELECT group_concat(tag, ' ') FROM note_tags WHERE note_id = new.id), ''),
		'note', new.id, new.companion_id, date(new.updated_at, 'unixepoch')
	);
END;
--> statement-breakpoint
CREATE TRIGGER search_note_au AFTER UPDATE ON notes BEGIN
	DELETE FROM search_index WHERE entity_type = 'note' AND entity_id = old.id;
	INSERT INTO search_index (title, body, entity_type, entity_id, companion_id, event_date)
	VALUES (
		new.title,
		COALESCE(new.body, '') || ' ' || COALESCE((SELECT group_concat(tag, ' ') FROM note_tags WHERE note_id = new.id), ''),
		'note', new.id, new.companion_id, date(new.updated_at, 'unixepoch')
	);
END;
--> statement-breakpoint
CREATE TRIGGER search_note_ad AFTER DELETE ON notes BEGIN
	DELETE FROM search_index WHERE entity_type = 'note' AND entity_id = old.id;
END;
--> statement-breakpoint
CREATE TRIGGER search_note_tag_ai AFTER INSERT ON note_tags BEGIN
	DELETE FROM search_index WHERE entity_type = 'note' AND entity_id = new.note_id;
	INSERT INTO search_index (title, body, entity_type, entity_id, companion_id, event_date)
	SELECT
		n.title,
		COALESCE(n.body, '') || ' ' || COALESCE((SELECT group_concat(tag, ' ') FROM note_tags WHERE note_id = n.id), ''),
		'note', n.id, n.companion_id, date(n.updated_at, 'unixepoch')
	FROM notes n WHERE n.id = new.note_id;
END;
--> statement-breakpoint
CREATE TRIGGER search_note_tag_ad AFTER DELETE ON note_tags BEGIN
	DELETE FROM search_index WHERE entity_type = 'note' AND entity_id = old.note_id;
	INSERT INTO search_index (title, body, entity_type, entity_id, companion_id, event_date)
	SELECT
		n.title,
		COALESCE(n.body, '') || ' ' || COALESCE((SELECT group_concat(tag, ' ') FROM note_tags WHERE note_id = n.id), ''),
		'note', n.id, n.companion_id, date(n.updated_at, 'unixepoch')
	FROM notes n WHERE n.id = old.note_id;
END;
--> statement-breakpoint
CREATE TRIGGER search_note_tag_au AFTER UPDATE ON note_tags BEGIN
	DELETE FROM search_index WHERE entity_type = 'note' AND entity_id IN (old.note_id, new.note_id);
	INSERT INTO search_index (title, body, entity_type, entity_id, companion_id, event_date)
	SELECT
		n.title,
		COALESCE(n.body, '') || ' ' || COALESCE((SELECT group_concat(tag, ' ') FROM note_tags WHERE note_id = n.id), ''),
		'note', n.id, n.companion_id, date(n.updated_at, 'unixepoch')
	FROM notes n WHERE n.id IN (old.note_id, new.note_id);
END;
