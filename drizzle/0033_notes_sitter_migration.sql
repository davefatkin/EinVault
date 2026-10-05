INSERT INTO notes (id, companion_id, title, body, shared_with_caretakers, pinned, created_at, updated_at)
SELECT lower(hex(randomblob(8))), id, 'Notes for sitter', notes_for_sitter, 1, 0, unixepoch(), unixepoch()
FROM companions
WHERE notes_for_sitter IS NOT NULL AND TRIM(notes_for_sitter, char(32, 9, 10, 13)) <> '';
--> statement-breakpoint
UPDATE companions SET notes_for_sitter = NULL;
