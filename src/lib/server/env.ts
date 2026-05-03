import { env } from '$env/dynamic/private';

/**
 * Parse an env var as a positive integer. Falls back to `defaultValue`
 * when the value is missing, non-numeric, or not > 0.
 */
function envInt(value: string | undefined, defaultValue: number): number {
	const n = Number(value);
	return Number.isInteger(n) && n > 0 ? n : defaultValue;
}

function envNonNegativeInt(value: string | undefined, defaultValue: number): number {
	const n = Number(value);
	return Number.isInteger(n) && n >= 0 ? n : defaultValue;
}

export const UPLOAD_MAX_MB = envInt(env.UPLOAD_MAX_MB, 10);
export const MAX_DAILY_PHOTOS = envInt(env.MAX_DAILY_PHOTOS, 5);

// 0 = no undo window (instant commit). >0 = seconds before dismissal commits.
export const REMINDER_UNDO_SECONDS_DEFAULT = envNonNegativeInt(env.REMINDER_UNDO_SECONDS, 7);

export const REMINDER_UNDO_PRESETS: readonly number[] = [0, 3, 7, 15];

export function resolveReminderUndoSeconds(userPref: number | null | undefined): number {
	if (typeof userPref === 'number' && Number.isInteger(userPref) && userPref >= 0) {
		return userPref;
	}
	return REMINDER_UNDO_SECONDS_DEFAULT;
}
