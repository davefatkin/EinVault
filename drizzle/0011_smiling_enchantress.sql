-- Weight Check was a vestigial health-event type — it never captured an
-- actual weight number (Log Weight uses the dedicated weight_entries table).
-- Drop the legacy rows entirely; no real measurement data is lost.
DELETE FROM health_events WHERE type = 'weight';
--> statement-breakpoint
-- Backfill: any remaining health event with a next_due_at becomes a one-shot
-- reminder. Health Events become a pure past-event log; future obligations
-- live in the reminders table only. Type mapping (enums differ):
-- vet_visit / procedure -> vet, vaccination -> vaccination,
-- medication -> medication, other -> other.
INSERT INTO reminders (
    id, companion_id, title, description, type,
    due_at, is_recurring, recurrence_unit, recurrence_interval,
    recurrence_anchor, recurrence_anchor_value, series_id,
    completed_at, completed_by, created_at, logged_by
)
SELECT
    lower(hex(randomblob(8))),
    h.companion_id,
    h.title,
    CASE WHEN h.notes IS NULL OR h.notes = '' THEN NULL ELSE h.notes END,
    CASE h.type
        WHEN 'vet_visit'   THEN 'vet'
        WHEN 'vaccination' THEN 'vaccination'
        WHEN 'medication'  THEN 'medication'
        WHEN 'procedure'   THEN 'vet'
        ELSE 'other'
    END,
    h.next_due_at,
    0,
    NULL, NULL, NULL, NULL,
    NULL,
    NULL, NULL,
    unixepoch(),
    h.logged_by
FROM health_events h
WHERE h.next_due_at IS NOT NULL;
--> statement-breakpoint
ALTER TABLE `health_events` DROP COLUMN `next_due_at`;
