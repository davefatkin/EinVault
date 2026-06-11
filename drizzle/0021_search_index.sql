CREATE VIRTUAL TABLE search_index USING fts5(
	title,
	body,
	entity_type UNINDEXED,
	entity_id UNINDEXED,
	companion_id UNINDEXED,
	event_date UNINDEXED,
	tokenize = 'unicode61 remove_diacritics 2',
	prefix = '2 3 4'
);
--> statement-breakpoint
CREATE TRIGGER search_journal_ai AFTER INSERT ON journal_entries BEGIN
	INSERT INTO search_index (title, body, entity_type, entity_id, companion_id, event_date)
	VALUES ('', COALESCE(new.body, ''), 'journal', new.id, new.companion_id, new.date);
END;
--> statement-breakpoint
CREATE TRIGGER search_journal_au AFTER UPDATE ON journal_entries BEGIN
	DELETE FROM search_index WHERE entity_type = 'journal' AND entity_id = old.id;
	INSERT INTO search_index (title, body, entity_type, entity_id, companion_id, event_date)
	VALUES ('', COALESCE(new.body, ''), 'journal', new.id, new.companion_id, new.date);
END;
--> statement-breakpoint
CREATE TRIGGER search_journal_ad AFTER DELETE ON journal_entries BEGIN
	DELETE FROM search_index WHERE entity_type = 'journal' AND entity_id = old.id;
END;
--> statement-breakpoint
CREATE TRIGGER search_health_ai AFTER INSERT ON health_events BEGIN
	INSERT INTO search_index (title, body, entity_type, entity_id, companion_id, event_date)
	VALUES (COALESCE(new.title, ''), COALESCE(new.notes, ''), 'health', new.id, new.companion_id, date(new.occurred_at, 'unixepoch'));
END;
--> statement-breakpoint
CREATE TRIGGER search_health_au AFTER UPDATE ON health_events BEGIN
	DELETE FROM search_index WHERE entity_type = 'health' AND entity_id = old.id;
	INSERT INTO search_index (title, body, entity_type, entity_id, companion_id, event_date)
	VALUES (COALESCE(new.title, ''), COALESCE(new.notes, ''), 'health', new.id, new.companion_id, date(new.occurred_at, 'unixepoch'));
END;
--> statement-breakpoint
CREATE TRIGGER search_health_ad AFTER DELETE ON health_events BEGIN
	DELETE FROM search_index WHERE entity_type = 'health' AND entity_id = old.id;
END;
--> statement-breakpoint
CREATE TRIGGER search_reminder_ai AFTER INSERT ON reminders BEGIN
	INSERT INTO search_index (title, body, entity_type, entity_id, companion_id, event_date)
	VALUES (COALESCE(new.title, ''), COALESCE(new.description, ''), 'reminder', new.id, new.companion_id, date(new.due_at, 'unixepoch'));
END;
--> statement-breakpoint
CREATE TRIGGER search_reminder_au AFTER UPDATE ON reminders BEGIN
	DELETE FROM search_index WHERE entity_type = 'reminder' AND entity_id = old.id;
	INSERT INTO search_index (title, body, entity_type, entity_id, companion_id, event_date)
	VALUES (COALESCE(new.title, ''), COALESCE(new.description, ''), 'reminder', new.id, new.companion_id, date(new.due_at, 'unixepoch'));
END;
--> statement-breakpoint
CREATE TRIGGER search_reminder_ad AFTER DELETE ON reminders BEGIN
	DELETE FROM search_index WHERE entity_type = 'reminder' AND entity_id = old.id;
END;
--> statement-breakpoint
CREATE TRIGGER search_document_ai AFTER INSERT ON documents BEGIN
	INSERT INTO search_index (title, body, entity_type, entity_id, companion_id, event_date)
	VALUES (COALESCE(new.title, ''), '', 'document', new.id, new.companion_id, COALESCE(new.document_date, date(new.created_at, 'unixepoch')));
END;
--> statement-breakpoint
CREATE TRIGGER search_document_au AFTER UPDATE ON documents BEGIN
	DELETE FROM search_index WHERE entity_type = 'document' AND entity_id = old.id;
	INSERT INTO search_index (title, body, entity_type, entity_id, companion_id, event_date)
	VALUES (COALESCE(new.title, ''), '', 'document', new.id, new.companion_id, COALESCE(new.document_date, date(new.created_at, 'unixepoch')));
END;
--> statement-breakpoint
CREATE TRIGGER search_document_ad AFTER DELETE ON documents BEGIN
	DELETE FROM search_index WHERE entity_type = 'document' AND entity_id = old.id;
END;
--> statement-breakpoint
CREATE TRIGGER search_daily_ai AFTER INSERT ON daily_events BEGIN
	INSERT INTO search_index (title, body, entity_type, entity_id, companion_id, event_date)
	VALUES ('', COALESCE(new.notes, ''), 'daily', new.id, new.companion_id, date(new.logged_at, 'unixepoch'));
END;
--> statement-breakpoint
CREATE TRIGGER search_daily_au AFTER UPDATE ON daily_events BEGIN
	DELETE FROM search_index WHERE entity_type = 'daily' AND entity_id = old.id;
	INSERT INTO search_index (title, body, entity_type, entity_id, companion_id, event_date)
	VALUES ('', COALESCE(new.notes, ''), 'daily', new.id, new.companion_id, date(new.logged_at, 'unixepoch'));
END;
--> statement-breakpoint
CREATE TRIGGER search_daily_ad AFTER DELETE ON daily_events BEGIN
	DELETE FROM search_index WHERE entity_type = 'daily' AND entity_id = old.id;
END;
--> statement-breakpoint
CREATE TRIGGER search_weight_ai AFTER INSERT ON weight_entries BEGIN
	INSERT INTO search_index (title, body, entity_type, entity_id, companion_id, event_date)
	VALUES ('', COALESCE(new.notes, ''), 'weight', new.id, new.companion_id, date(new.recorded_at, 'unixepoch'));
END;
--> statement-breakpoint
CREATE TRIGGER search_weight_au AFTER UPDATE ON weight_entries BEGIN
	DELETE FROM search_index WHERE entity_type = 'weight' AND entity_id = old.id;
	INSERT INTO search_index (title, body, entity_type, entity_id, companion_id, event_date)
	VALUES ('', COALESCE(new.notes, ''), 'weight', new.id, new.companion_id, date(new.recorded_at, 'unixepoch'));
END;
--> statement-breakpoint
CREATE TRIGGER search_weight_ad AFTER DELETE ON weight_entries BEGIN
	DELETE FROM search_index WHERE entity_type = 'weight' AND entity_id = old.id;
END;
--> statement-breakpoint
INSERT INTO search_index (title, body, entity_type, entity_id, companion_id, event_date)
SELECT '', COALESCE(body, ''), 'journal', id, companion_id, date FROM journal_entries;
--> statement-breakpoint
INSERT INTO search_index (title, body, entity_type, entity_id, companion_id, event_date)
SELECT COALESCE(title, ''), COALESCE(notes, ''), 'health', id, companion_id, date(occurred_at, 'unixepoch') FROM health_events;
--> statement-breakpoint
INSERT INTO search_index (title, body, entity_type, entity_id, companion_id, event_date)
SELECT COALESCE(title, ''), COALESCE(description, ''), 'reminder', id, companion_id, date(due_at, 'unixepoch') FROM reminders;
--> statement-breakpoint
INSERT INTO search_index (title, body, entity_type, entity_id, companion_id, event_date)
SELECT COALESCE(title, ''), '', 'document', id, companion_id, COALESCE(document_date, date(created_at, 'unixepoch')) FROM documents;
--> statement-breakpoint
INSERT INTO search_index (title, body, entity_type, entity_id, companion_id, event_date)
SELECT '', COALESCE(notes, ''), 'daily', id, companion_id, date(logged_at, 'unixepoch') FROM daily_events;
--> statement-breakpoint
INSERT INTO search_index (title, body, entity_type, entity_id, companion_id, event_date)
SELECT '', COALESCE(notes, ''), 'weight', id, companion_id, date(recorded_at, 'unixepoch') FROM weight_entries;
