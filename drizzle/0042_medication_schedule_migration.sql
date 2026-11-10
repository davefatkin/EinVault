INSERT INTO medications (id, companion_id, name, instructions, started_on)
SELECT lower(hex(randomblob(8))), id, 'Medication schedule', medication_schedule, date('now', 'localtime')
FROM companions
WHERE medication_schedule IS NOT NULL AND TRIM(medication_schedule, char(32, 9, 10, 13)) <> '';
--> statement-breakpoint
UPDATE companions SET medication_schedule = NULL;
