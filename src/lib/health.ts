// Client-safe helpers for the Health Events ↔ Reminders bridge. Imported by
// the health page (button hrefs) and by the health server action (redirect on
// "Save & Add Reminder"). Must not import $env or $lib/server modules so the
// browser bundle stays clean.

export type HealthEventType = 'vet_visit' | 'vaccination' | 'medication' | 'procedure' | 'other';
export type ReminderType = 'vet' | 'medication' | 'vaccination' | 'grooming' | 'other';

// Mirrors the CASE in migration 0011's backfill INSERT. Keep them in sync if
// either enum changes. The migration is frozen, so new enum values should
// also extend this map.
export const HEALTH_TO_REMINDER_TYPE: Record<HealthEventType, ReminderType> = {
	vet_visit: 'vet',
	vaccination: 'vaccination',
	medication: 'medication',
	procedure: 'vet',
	other: 'other'
};

/**
 * Build a URL for the reminders page's `?new=1` prefill flow from a health
 * event's fields. Truncates title/description to safe upper bounds; the
 * reminders page applies the same caps when reading the params.
 */
export function reminderPrefillUrl(
	companionId: string,
	healthType: HealthEventType,
	title: string,
	notes: string | null
): string {
	const parts = [
		'new=1',
		`title=${encodeURIComponent(title.slice(0, 200))}`,
		`type=${encodeURIComponent(HEALTH_TO_REMINDER_TYPE[healthType])}`
	];
	if (notes) parts.push(`description=${encodeURIComponent(notes.slice(0, 2000))}`);
	return `/${companionId}/reminders?${parts.join('&')}`;
}
