-- Medications and supplies in search. Hand-written triggers, as 0032 and 0039
-- did; drizzle-kit does not model them, and a rebuild of any table below drops
-- them (see the warnings in schema.ts).
--
-- A medication's event_date is started_on. A supply has no pet of its own, so
-- it gets one row per linked companion and search() shows one of them. Its
-- event_date is the local day it was created.
--
-- The update triggers fire only when an indexed column changes: supplies are
-- rewritten on every dose and purchase, and each DELETE scans the whole index.
INSERT INTO search_index (title, body, entity_type, entity_id, companion_id, event_date)
SELECT name, TRIM(COALESCE(dose, '') || ' ' || COALESCE(instructions, '')),
	'medication', id, companion_id, started_on
FROM medications;
--> statement-breakpoint
INSERT INTO search_index (title, body, entity_type, entity_id, companion_id, event_date)
SELECT s.name, COALESCE(s.notes, ''), 'supply', s.id, sc.companion_id,
	date(s.created_at, 'unixepoch', 'localtime')
FROM supplies s JOIN supply_companions sc ON sc.supply_id = s.id;
--> statement-breakpoint
CREATE TRIGGER search_medication_ai AFTER INSERT ON medications BEGIN
	INSERT INTO search_index (title, body, entity_type, entity_id, companion_id, event_date)
	VALUES (new.name, TRIM(COALESCE(new.dose, '') || ' ' || COALESCE(new.instructions, '')),
		'medication', new.id, new.companion_id, new.started_on);
END;
--> statement-breakpoint
CREATE TRIGGER search_medication_au
AFTER UPDATE OF name, dose, instructions, started_on, companion_id ON medications
WHEN old.name IS NOT new.name OR old.dose IS NOT new.dose
	OR old.instructions IS NOT new.instructions OR old.started_on IS NOT new.started_on
	OR old.companion_id IS NOT new.companion_id BEGIN
	DELETE FROM search_index WHERE entity_type = 'medication' AND entity_id = old.id;
	INSERT INTO search_index (title, body, entity_type, entity_id, companion_id, event_date)
	VALUES (new.name, TRIM(COALESCE(new.dose, '') || ' ' || COALESCE(new.instructions, '')),
		'medication', new.id, new.companion_id, new.started_on);
END;
--> statement-breakpoint
CREATE TRIGGER search_medication_ad AFTER DELETE ON medications BEGIN
	DELETE FROM search_index WHERE entity_type = 'medication' AND entity_id = old.id;
END;
--> statement-breakpoint
-- insertSupply adds the links after the supply, so this usually finds none;
-- the link trigger below indexes each one as it lands.
CREATE TRIGGER search_supply_ai AFTER INSERT ON supplies BEGIN
	INSERT INTO search_index (title, body, entity_type, entity_id, companion_id, event_date)
	SELECT new.name, COALESCE(new.notes, ''), 'supply', new.id, sc.companion_id,
		date(new.created_at, 'unixepoch', 'localtime')
	FROM supply_companions sc WHERE sc.supply_id = new.id;
END;
--> statement-breakpoint
CREATE TRIGGER search_supply_au AFTER UPDATE OF name, notes, created_at ON supplies
WHEN old.name IS NOT new.name OR old.notes IS NOT new.notes
	OR old.created_at IS NOT new.created_at BEGIN
	DELETE FROM search_index WHERE entity_type = 'supply' AND entity_id = old.id;
	INSERT INTO search_index (title, body, entity_type, entity_id, companion_id, event_date)
	SELECT new.name, COALESCE(new.notes, ''), 'supply', new.id, sc.companion_id,
		date(new.created_at, 'unixepoch', 'localtime')
	FROM supply_companions sc WHERE sc.supply_id = new.id;
END;
--> statement-breakpoint
CREATE TRIGGER search_supply_ad AFTER DELETE ON supplies BEGIN
	DELETE FROM search_index WHERE entity_type = 'supply' AND entity_id = old.id;
END;
--> statement-breakpoint
CREATE TRIGGER search_supply_link_ai AFTER INSERT ON supply_companions BEGIN
	INSERT INTO search_index (title, body, entity_type, entity_id, companion_id, event_date)
	SELECT s.name, COALESCE(s.notes, ''), 'supply', s.id, new.companion_id,
		date(s.created_at, 'unixepoch', 'localtime')
	FROM supplies s WHERE s.id = new.supply_id;
END;
--> statement-breakpoint
CREATE TRIGGER search_supply_link_au AFTER UPDATE ON supply_companions BEGIN
	DELETE FROM search_index
	WHERE entity_type = 'supply' AND entity_id = old.supply_id AND companion_id = old.companion_id;
	INSERT INTO search_index (title, body, entity_type, entity_id, companion_id, event_date)
	SELECT s.name, COALESCE(s.notes, ''), 'supply', s.id, new.companion_id,
		date(s.created_at, 'unixepoch', 'localtime')
	FROM supplies s WHERE s.id = new.supply_id;
END;
--> statement-breakpoint
CREATE TRIGGER search_supply_link_ad AFTER DELETE ON supply_companions BEGIN
	DELETE FROM search_index
	WHERE entity_type = 'supply' AND entity_id = old.supply_id AND companion_id = old.companion_id;
END;
