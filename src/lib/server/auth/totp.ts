import { TOTP, Secret } from 'otpauth';
import { createHash, randomBytes } from 'node:crypto';

const ISSUER = 'EinVault';
const PERIOD = 30;
const DIGITS = 6;

export function generateSecret(): string {
	return new Secret({ size: 20 }).base32;
}

export function provisioningUri(secret: string, accountName: string): string {
	return new TOTP({
		issuer: ISSUER,
		label: accountName,
		secret: Secret.fromBase32(secret),
		digits: DIGITS,
		period: PERIOD
	}).toString();
}

export interface VerifyResult {
	valid: boolean;
	/** The matched time step (counter), for the replay guard. -1 when invalid. */
	step: number;
}

/**
 * Verify a 6-digit code with one step of drift tolerance. When `lastStep` is
 * given, a matched step <= lastStep is treated as a replay and rejected.
 */
export function verifyCode(
	secret: string,
	code: string,
	opts: { at?: number; lastStep?: number } = {}
): VerifyResult {
	const at = opts.at ?? Date.now();
	const totp = new TOTP({
		secret: Secret.fromBase32(secret),
		digits: DIGITS,
		period: PERIOD
	});
	const delta = totp.validate({ token: code.replace(/\s/g, ''), window: 1, timestamp: at });
	if (delta === null) return { valid: false, step: -1 };
	const step = Math.floor(at / 1000 / PERIOD) + delta;
	if (opts.lastStep !== undefined && step <= opts.lastStep) return { valid: false, step: -1 };
	return { valid: true, step };
}

// --- Backup codes ---

const ALPHABET = 'abcdefghjkmnpqrstuvwxyz23456789'; // no ambiguous chars

export function generateBackupCodes(n = 10): string[] {
	const codes = new Set<string>();
	while (codes.size < n) {
		const raw = Array.from(randomBytes(10), (b) => ALPHABET[b % ALPHABET.length]).join('');
		codes.add(`${raw.slice(0, 5)}-${raw.slice(5, 10)}`);
	}
	return [...codes];
}

export function normalizeBackupCode(code: string): string {
	return code.trim().toLowerCase().replace(/\s/g, '');
}

export function hashBackupCode(code: string): string {
	return createHash('sha256').update(normalizeBackupCode(code)).digest('hex');
}
