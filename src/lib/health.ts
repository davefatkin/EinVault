// Client-safe helpers for the Health Events ↔ Reminders bridge, plus the shared
// HealthDetail shape for the detail modal. Imported by
// the health page (button hrefs), the health server action (redirect on
// "Save & Add Reminder"), and the reminder complete actions (redirect on
// "Log event"). Must not import $env or #lib/server modules so the browser
// bundle stays clean.

import type { UserRef } from '#lib/types.js';

export type HealthEventType =
	'vet_visit' | 'vaccination' | 'medication' | 'procedure' | 'other' | 'incident';
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
	other: 'other',
	incident: 'other'
} as const satisfies Record<HealthEventType, ReminderType>;

// Reverse mapping for the "Log event" flow on reminder dismissal. `null`
// means "no health event to log for this reminder kind", so "Log event" is
// not offered. Medication reminders map to null: doses belong on the
// Medications page, and new health events no longer take that type.
export const REMINDER_TO_HEALTH_TYPE = {
	vet: 'vet_visit',
	medication: null,
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
 * The reminders page's `?new=1` form for a dose reminder: type medication,
 * title = name, notes = dose, plus the hidden link to the medication.
 */
export function medicationReminderPrefillUrl(
	companionId: string,
	medication: { id: string; name: string; dose: string | null }
): string {
	const url = reminderPrefillUrl(companionId, 'medication', medication.name, medication.dose);
	return `${url}&medicationId=${encodeURIComponent(medication.id)}`;
}

/**
 * Whether completing a reminder may offer "Log event": only for reminder
 * types with a matching health event type, and never for a reminder linked
 * to a medication (it logs a dose already).
 */
export function reminderAllowsLogEvent(reminder: {
	type: string;
	medicationId?: string | null;
}): boolean {
	return !reminder.medicationId && REMINDER_TO_HEALTH_TYPE[reminder.type as ReminderType] !== null;
}

/**
 * Where a "Done & Log Event" completion goes next, or null to stay put. The
 * same rule as the button: no URL when reminderAllowsLogEvent says no.
 */
export function reminderLogEventUrl(reminder: {
	companionId: string;
	type: ReminderType;
	title: string;
	description: string | null;
	medicationId: string | null;
}): string | null {
	const type = REMINDER_TO_HEALTH_TYPE[reminder.type];
	if (!type || !reminderAllowsLogEvent(reminder)) return null;
	return healthEventPrefillUrl(reminder.companionId, {
		title: reminder.title,
		description: reminder.description,
		type
	});
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

/** What the shared health/weight detail modal renders. */
export type HealthDetail =
	| {
			kind: 'health';
			id: string;
			type: string;
			title: string;
			at: Date | string;
			vetName: string | null;
			vetClinic: string | null;
			notes: string | null;
			logger: UserRef;
			journalDates?: string[];
	  }
	| {
			kind: 'weight';
			id: string;
			weight: number;
			unit: string;
			at: Date | string;
			notes: string | null;
			logger: UserRef;
	  };
