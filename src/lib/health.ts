// Client-safe helpers for the Health Events ↔ Reminders bridge. Imported by
// the health page (button hrefs), the health server action (redirect on
// "Save & Add Reminder"), and the reminder complete actions (redirect on
// "Log event"). Must not import $env or $lib/server modules so the browser
// bundle stays clean.

export type HealthEventType = 'vet_visit' | 'vaccination' | 'medication' | 'procedure' | 'other';
export type ReminderType = 'vet' | 'medication' | 'vaccination' | 'grooming' | 'other';

// Mirrors the CASE in migration 0011's backfill INSERT. Keep them in sync if
// either enum changes. The migration is frozen, so new enum values should
// also extend this map. `satisfies` enforces exhaustiveness over the union
// while preserving narrow literal values for downstream callers.
export const HEALTH_TO_REMINDER_TYPE = {
	vet_visit: 'vet',
	vaccination: 'vaccination',
	medication: 'medication',
	procedure: 'vet',
	other: 'other'
} as const satisfies Record<HealthEventType, ReminderType>;

// Reverse mapping for the "Log event" flow on reminder dismissal. `null`
// means "no sensible default health type for this reminder kind" so the
// URL builder omits `?type=` and the destination form picks its own default.
export const REMINDER_TO_HEALTH_TYPE = {
	vet: 'vet_visit',
	medication: 'medication',
	vaccination: 'vaccination',
	grooming: null,
	other: null
} as const satisfies Record<ReminderType, HealthEventType | null>;

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

/**
 * Build a URL for the health page's `?new=1` prefill flow from a reminder's
 * fields. Mirrors `reminderPrefillUrl` but the other direction. `type` is
 * optional; omit it when the reminder type doesn't map to a sensible health
 * type and the form should fall back to its default.
 */
export function healthEventPrefillUrl(
	companionId: string,
	opts: { title: string; description: string | null; type?: HealthEventType }
): string {
	const parts = ['new=1', `title=${encodeURIComponent(opts.title.slice(0, 200))}`];
	if (opts.type) parts.push(`type=${encodeURIComponent(opts.type)}`);
	if (opts.description)
		parts.push(`description=${encodeURIComponent(opts.description.slice(0, 2000))}`);
	return `/${companionId}/health?${parts.join('&')}`;
}
