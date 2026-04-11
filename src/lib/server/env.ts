import { env } from '$env/dynamic/private';

/**
 * Parse an env var as a positive integer. Falls back to `defaultValue`
 * when the value is missing, non-numeric, or not > 0.
 */
function envInt(value: string | undefined, defaultValue: number): number {
	const n = Number(value);
	return Number.isInteger(n) && n > 0 ? n : defaultValue;
}

export const UPLOAD_MAX_MB = envInt(env.UPLOAD_MAX_MB, 10);
export const MAX_DAILY_PHOTOS = envInt(env.MAX_DAILY_PHOTOS, 5);
