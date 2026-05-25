import { env } from '$env/dynamic/private';
import { REMINDER_UNDO_MAX_SECONDS } from '$lib/reminderUndo';
import type { StorageProvider } from '$lib/server/storage/types';

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
//
// Immich is intentionally excluded from this set: it's a read-only reference
// layer, never a write destination. The type derives from StorageProvider so
// adding a provider to the union forces an update here.
export type StorageBackendName = Exclude<StorageProvider, 'immich'>;
const ALLOWED_BACKENDS: readonly StorageBackendName[] = ['local', 's3'];

const rawStorageBackend = (env.STORAGE_BACKEND ?? 'local').toLowerCase();
if (!(ALLOWED_BACKENDS as readonly string[]).includes(rawStorageBackend)) {
	throw new Error(
		`Invalid STORAGE_BACKEND '${env.STORAGE_BACKEND}'. Allowed: ${ALLOWED_BACKENDS.join(', ')}.`
	);
}
export const STORAGE_BACKEND: StorageBackendName = rawStorageBackend as StorageBackendName;

export interface S3Config {
	endpoint: string;
	bucket: string;
	region: string;
	accessKeyId: string;
	secretAccessKey: string;
	forcePathStyle: boolean;
	presignTtlSeconds: number;
}

const S3_REQUIRED_VARS = [
	'S3_ENDPOINT',
	'S3_BUCKET',
	'S3_ACCESS_KEY_ID',
	'S3_SECRET_ACCESS_KEY'
] as const;

function readS3Config(): { config: S3Config | null; missing: string[] } {
	const missing = S3_REQUIRED_VARS.filter((name) => !env[name]);
	if (missing.length === S3_REQUIRED_VARS.length) return { config: null, missing };
	if (missing.length > 0) return { config: null, missing };
	return {
		config: {
			endpoint: env.S3_ENDPOINT!.replace(/\/$/, ''),
			bucket: env.S3_BUCKET!,
			region: env.S3_REGION ?? 'auto',
			accessKeyId: env.S3_ACCESS_KEY_ID!,
			secretAccessKey: env.S3_SECRET_ACCESS_KEY!,
			forcePathStyle: env.S3_FORCE_PATH_STYLE === 'true',
			presignTtlSeconds: envInt(env.S3_PRESIGN_TTL_SECONDS, 300)
		},
		missing: []
	};
}

const s3Result = readS3Config();
export const S3_CONFIG = s3Result.config;

export function logStorageBootStatus(): void {
	if (STORAGE_BACKEND === 's3' && !S3_CONFIG) {
		// This will be caught at first use; surface it clearly at boot too.
		console.error(
			`[storage] STORAGE_BACKEND=s3 but S3 config incomplete. Missing: ${s3Result.missing.join(', ')}. The app will fail when a write is attempted.`
		);
	} else if (s3Result.missing.length > 0 && s3Result.missing.length < S3_REQUIRED_VARS.length) {
		console.warn(
			`[storage] Partial S3 config detected (missing: ${s3Result.missing.join(', ')}). S3 backend disabled. Set STORAGE_BACKEND=s3 and complete the config to enable.`
		);
	} else if (S3_CONFIG) {
		console.info(
			`[storage] S3 backend ${STORAGE_BACKEND === 's3' ? 'active' : 'available'} endpoint=${S3_CONFIG.endpoint} bucket=${S3_CONFIG.bucket}`
		);
	}
}

// Immich integration is a read-only reference layer, NOT a write destination.
// When configured, users can pick existing assets from their Immich library to
// attach to journal entries or as a companion avatar. EinVault stores a
// reference (provider='immich', storage_key='immich:{assetId}') and proxies
// reads through the server using the API key. EinVault never uploads to
// Immich and never deletes Immich assets.
export interface ImmichConfig {
	url: string;
	apiKey: string;
	albumId: string | null;
}

const IMMICH_REQUIRED_VARS = ['IMMICH_URL', 'IMMICH_API_KEY'] as const;

function readImmichConfig(): { config: ImmichConfig | null; missing: string[] } {
	const url = env.IMMICH_URL?.trim();
	const apiKey = env.IMMICH_API_KEY?.trim();
	const albumId = env.IMMICH_ALBUM_ID?.trim() || null;
	const missing = IMMICH_REQUIRED_VARS.filter((name) => !env[name]?.trim());
	if (missing.length === IMMICH_REQUIRED_VARS.length) return { config: null, missing };
	if (missing.length > 0) return { config: null, missing };
	return {
		config: {
			url: url!.replace(/\/$/, ''),
			apiKey: apiKey!,
			albumId
		},
		missing: []
	};
}

const immichResult = readImmichConfig();
export const IMMICH_CONFIG = immichResult.config;

export function logImmichBootStatus(): void {
	if (
		immichResult.missing.length > 0 &&
		immichResult.missing.length < IMMICH_REQUIRED_VARS.length
	) {
		console.warn(
			`[immich] Partial config detected (missing: ${immichResult.missing.join(', ')}). Integration disabled. Set both IMMICH_URL and IMMICH_API_KEY to enable.`
		);
		return;
	}
	if (IMMICH_CONFIG) {
		console.info(
			`[immich] enabled url=${IMMICH_CONFIG.url}${IMMICH_CONFIG.albumId ? ` album=${IMMICH_CONFIG.albumId}` : ''}`
		);
	}
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
