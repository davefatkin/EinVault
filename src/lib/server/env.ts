import { env } from '$env/dynamic/private';
import { join } from 'path';
import { REMINDER_UNDO_MAX_SECONDS } from '$lib/reminderUndo';
import { DATA_DIR } from '$lib/server/paths';
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

/**
 * Parse an env var as a boolean. Only the exact string 'true' (case-insensitive,
 * trimmed) is truthy; everything else — including unset — is `defaultValue` when
 * the value is undefined, otherwise false. Mirrors the existing
 * `S3_FORCE_PATH_STYLE === 'true'` convention.
 */
function envBool(value: string | undefined, defaultValue: boolean): boolean {
	if (value === undefined) return defaultValue;
	return value.trim().toLowerCase() === 'true';
}

export const UPLOAD_MAX_MB = envInt(env.UPLOAD_MAX_MB, 10);
export const VIDEO_MAX_MB = envInt(env.VIDEO_MAX_MB, 100);

// MAX_DAILY_PHOTOS was renamed to MAX_DAILY_MEDIA when journal video support
// landed: the daily cap now counts photos and videos together. The old name is
// still honored as a fallback; logDeprecatedEnvWarnings() warns about it at boot.
export const MAX_DAILY_MEDIA = envInt(env.MAX_DAILY_MEDIA ?? env.MAX_DAILY_PHOTOS, 5);

export function logDeprecatedEnvWarnings(): void {
	if (env.MAX_DAILY_PHOTOS !== undefined) {
		console.warn(
			'[env] MAX_DAILY_PHOTOS is deprecated and will be removed in a future release. ' +
				'Rename it to MAX_DAILY_MEDIA. The cap now counts photos and videos together.'
		);
	}
}

// Optional server-side video transcoding (issue #86). Off by default: it needs
// the ffmpeg/ffprobe binaries in the image and is CPU-intensive. When enabled,
// uploaded videos are transcoded to a universal web profile (H.264 + AAC MP4,
// +faststart) with a generated poster, so they play cross-browser instead of
// failing to decode (e.g. Apple HEVC in Firefox). The binaries are probed at
// boot by the transcode module; if absent, the feature self-disables and videos
// are stored as-is (the pre-#86 behavior). Hardening rationale for the caps and
// pinned paths lives in src/lib/server/video/.
export interface VideoTranscodeConfig {
	// Operator intent. The effective on/off state also depends on the boot-time
	// binary probe (see src/lib/server/video/transcode.ts).
	enabled: boolean;
	// Keep the original source video alongside the transcoded copy. The original
	// is never served to clients; it is retained for re-encode/backup only.
	keepOriginal: boolean;
	// Refuse to transcode inputs larger than this many MB (bounds decode work in
	// addition to the resolution/duration caps below). Defaults to VIDEO_MAX_MB.
	maxMb: number;
	// Reject (via ffprobe) inputs longer than this, or larger than these pixel
	// dimensions, before spending CPU on a decode. Guards against decompression
	// bombs where a tiny file expands to enormous decoded work.
	maxSeconds: number;
	maxWidth: number;
	maxHeight: number;
	// Absolute, pinned binary paths. Pinned (not PATH-resolved) so the boot probe
	// and the spawn target the same binary — closes a PATH-hijack TOCTOU.
	ffmpegPath: string;
	ffprobePath: string;
	// Scratch directory for per-job temp files. MUST be disk-backed and roomy:
	// it holds the downloaded original + decode scratch + output, which exceed
	// the 64 MB RAM tmpfs the container mounts at /tmp. Defaults to a subdir of
	// the data volume.
	tmpDir: string;
}

// Hard ceiling for the per-job duration cap. Bounds the transcode wall-clock
// timeout (derived from maxSeconds) so a misconfigured large value can't
// effectively disable the SIGKILL backstop and pin the single worker for days.
const VIDEO_TRANSCODE_MAX_SECONDS_CEILING = 3600;

export const VIDEO_TRANSCODE: VideoTranscodeConfig = {
	enabled: envBool(env.VIDEO_TRANSCODE, false),
	keepOriginal: envBool(env.VIDEO_KEEP_ORIGINAL, true),
	maxMb: envInt(env.VIDEO_TRANSCODE_MAX_MB, VIDEO_MAX_MB),
	maxSeconds: Math.min(
		envInt(env.VIDEO_TRANSCODE_MAX_SECONDS, 600),
		VIDEO_TRANSCODE_MAX_SECONDS_CEILING
	),
	maxWidth: envInt(env.VIDEO_TRANSCODE_MAX_WIDTH, 4096),
	maxHeight: envInt(env.VIDEO_TRANSCODE_MAX_HEIGHT, 4096),
	ffmpegPath: env.VIDEO_FFMPEG_PATH?.trim() || '/usr/bin/ffmpeg',
	ffprobePath: env.VIDEO_FFPROBE_PATH?.trim() || '/usr/bin/ffprobe',
	tmpDir: env.VIDEO_TMP_DIR?.trim() || join(DATA_DIR, 'transcode-tmp')
};

export function logVideoTranscodeBootStatus(): void {
	// A set-but-unrecognized value parses as `false` (fail-closed). Warn so an
	// operator who wrote VIDEO_TRANSCODE=1/yes isn't left believing it is on.
	const raw = env.VIDEO_TRANSCODE?.trim().toLowerCase();
	if (raw !== undefined && raw !== 'true' && raw !== 'false') {
		console.warn(
			`[video] VIDEO_TRANSCODE='${env.VIDEO_TRANSCODE}' is not 'true' or 'false'; treating as disabled.`
		);
	}
	console.info(`[video] transcoding ${VIDEO_TRANSCODE.enabled ? 'requested' : 'disabled'} (env)`);
}

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

// Optional SMTP email (issue #12). Off unless SMTP_HOST and SMTP_FROM are both
// set (same gating convention as OIDC and Immich). Used for the forgot-password
// flow; future PRs add reminder notifications on top of the same transport.
export interface SmtpConfig {
	host: string;
	port: number;
	// true = implicit TLS (typically port 465); false = STARTTLS upgrade (587).
	secure: boolean;
	// Auth is optional: unauthenticated LAN relays are common in homelab setups.
	user: string | null;
	pass: string | null;
	// RFC 5322 From, e.g. 'EinVault <einvault@example.com>'.
	from: string;
}

const SMTP_REQUIRED_VARS = ['SMTP_HOST', 'SMTP_FROM'] as const;

function readSmtpConfig(): { config: SmtpConfig | null; missing: string[] } {
	const missing = SMTP_REQUIRED_VARS.filter((name) => !env[name]?.trim());
	if (missing.length === SMTP_REQUIRED_VARS.length) return { config: null, missing };
	if (missing.length > 0) return { config: null, missing };
	return {
		config: {
			host: env.SMTP_HOST!.trim(),
			port: envInt(env.SMTP_PORT, 587),
			secure: envBool(env.SMTP_SECURE, false),
			user: env.SMTP_USER?.trim() || null,
			// Deliberately not trimmed: passwords may legitimately contain
			// leading/trailing whitespace.
			pass: env.SMTP_PASS || null,
			from: env.SMTP_FROM!.trim()
		},
		missing: []
	};
}

const smtpResult = readSmtpConfig();
export const SMTP_CONFIG = smtpResult.config;

export function logSmtpBootStatus(): void {
	if (smtpResult.missing.length > 0 && smtpResult.missing.length < SMTP_REQUIRED_VARS.length) {
		console.warn(
			`[mail] Partial SMTP config detected (missing: ${smtpResult.missing.join(', ')}). Email disabled. Set both SMTP_HOST and SMTP_FROM to enable.`
		);
		return;
	}
	if (SMTP_CONFIG) {
		console.info(
			`[mail] SMTP enabled host=${SMTP_CONFIG.host} port=${SMTP_CONFIG.port} secure=${SMTP_CONFIG.secure} auth=${SMTP_CONFIG.user ? 'yes' : 'no'}`
		);
		if (!env.ORIGIN) {
			console.warn(
				'[mail] ORIGIN is not set; password reset links may carry the wrong origin behind a reverse proxy.'
			);
		}
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
