import { env } from '$env/dynamic/private';
import { REMINDER_UNDO_MAX_SECONDS } from '$lib/reminderUndo';

export {
	REMINDER_UNDO_MAX_SECONDS,
	REMINDER_UNDO_PRESETS,
	REMINDER_UNDO_DEFAULT_SENTINEL
} from '$lib/reminderUndo';

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

// Storage backend selection. 'local' writes to DATA_DIR/uploads; 's3' uses an
// S3-compatible bucket (AWS, Garage, MinIO, Backblaze B2, R2, ...). Reads
// always honor the per-row provider column, so switching here only affects
// new writes — existing 'local' rows keep streaming from disk.
const rawStorageBackend = (env.STORAGE_BACKEND ?? 'local').toLowerCase();
if (rawStorageBackend !== 'local' && rawStorageBackend !== 's3') {
	throw new Error(`Invalid STORAGE_BACKEND '${env.STORAGE_BACKEND}'. Allowed: local, s3.`);
}
export const STORAGE_BACKEND: 'local' | 's3' = rawStorageBackend;

export interface S3Config {
	endpoint: string;
	bucket: string;
	region: string;
	accessKeyId: string;
	secretAccessKey: string;
	forcePathStyle: boolean;
	presignTtlSeconds: number;
}

function readS3Config(): S3Config | null {
	const fields: Array<[keyof S3Config, string | undefined]> = [
		['endpoint', env.S3_ENDPOINT],
		['bucket', env.S3_BUCKET],
		['accessKeyId', env.S3_ACCESS_KEY_ID],
		['secretAccessKey', env.S3_SECRET_ACCESS_KEY]
	];
	const envNames: Record<string, string> = {
		endpoint: 'S3_ENDPOINT',
		bucket: 'S3_BUCKET',
		accessKeyId: 'S3_ACCESS_KEY_ID',
		secretAccessKey: 'S3_SECRET_ACCESS_KEY'
	};
	const missing = fields.filter(([, v]) => !v).map(([k]) => envNames[k as string]);
	if (missing.length === fields.length) return null;
	if (missing.length > 0) {
		throw new Error(`S3 config incomplete. Missing: ${missing.join(', ')}.`);
	}
	return {
		endpoint: env.S3_ENDPOINT!.replace(/\/$/, ''),
		bucket: env.S3_BUCKET!,
		region: env.S3_REGION ?? 'auto',
		accessKeyId: env.S3_ACCESS_KEY_ID!,
		secretAccessKey: env.S3_SECRET_ACCESS_KEY!,
		forcePathStyle: env.S3_FORCE_PATH_STYLE === 'true',
		presignTtlSeconds: envInt(env.S3_PRESIGN_TTL_SECONDS, 300)
	};
}

export const S3_CONFIG = readS3Config();

if (STORAGE_BACKEND === 's3' && !S3_CONFIG) {
	throw new Error(
		'STORAGE_BACKEND=s3 but S3 config missing. Set S3_ENDPOINT, S3_BUCKET, S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY.'
	);
}

// 0 = no undo window (instant commit). >0 = seconds before dismissal commits.
export const REMINDER_UNDO_SECONDS_DEFAULT = Math.min(
	envNonNegativeInt(env.REMINDER_UNDO_SECONDS, 7),
	REMINDER_UNDO_MAX_SECONDS
);

export function resolveReminderUndoSeconds(userPref: number | null | undefined): number {
	if (typeof userPref === 'number' && Number.isInteger(userPref) && userPref >= 0) {
		return Math.min(userPref, REMINDER_UNDO_MAX_SECONDS);
	}
	return REMINDER_UNDO_SECONDS_DEFAULT;
}
