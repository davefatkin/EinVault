import { env } from '$env/dynamic/private';

/**
 * Parse an env var as a positive integer (n > 0). Falls back to
 * `defaultValue` when the value is missing, non-numeric, or not positive.
 */
function envInt(value: string | undefined, defaultValue: number): number {
	const n = Number(value);
	return Number.isInteger(n) && n > 0 ? n : defaultValue;
}

/**
 * Parse an env var as a non-negative integer (n >= 0). Falls back to
 * `defaultValue` when the value is missing, non-numeric, or negative.
 * Use this for values where 0 is a meaningful "off" sentinel (e.g. an
 * undo window of 0 seconds means "commit immediately").
 */
function envNonNegativeInt(value: string | undefined, defaultValue: number): number {
	const n = Number(value);
	return Number.isInteger(n) && n >= 0 ? n : defaultValue;
}

export const UPLOAD_MAX_MB = envInt(env.UPLOAD_MAX_MB, 10);
export const MAX_DAILY_PHOTOS = envInt(env.MAX_DAILY_PHOTOS, 5);

/**
 * Upper bound for the reminder undo window, in seconds. Values above this
 * are clamped, both at env-resolution time and when reading user prefs that
 * may have been stored before validation tightening.
 */
export const REMINDER_UNDO_MAX_SECONDS = 60;

// 0 = no undo window (instant commit). >0 = seconds before dismissal commits.
export const REMINDER_UNDO_SECONDS_DEFAULT = Math.min(
	envNonNegativeInt(env.REMINDER_UNDO_SECONDS, 7),
	REMINDER_UNDO_MAX_SECONDS
);

export const REMINDER_UNDO_PRESETS: readonly number[] = [0, 3, 7, 15];

/**
 * Sentinel value used by the settings form to signal "use the site default
 * (env-resolved) value" rather than overriding it. Shared between the server
 * validator and the client form so the contract has one source of truth.
 */
export const REMINDER_UNDO_DEFAULT_SENTINEL = 'default';

export function resolveReminderUndoSeconds(userPref: number | null | undefined): number {
	if (typeof userPref === 'number' && Number.isInteger(userPref) && userPref >= 0) {
		return Math.min(userPref, REMINDER_UNDO_MAX_SECONDS);
	}
	return REMINDER_UNDO_SECONDS_DEFAULT;
}
