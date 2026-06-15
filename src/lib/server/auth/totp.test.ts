import { describe, it, expect } from 'vitest';
import { TOTP, Secret } from 'otpauth';
import {
	generateSecret,
	provisioningUri,
	verifyCode,
	generateBackupCodes,
	hashBackupCode,
	normalizeBackupCode
} from './totp';

function codeFor(secret: string, timestamp: number): string {
	return new TOTP({ secret: Secret.fromBase32(secret), digits: 6, period: 30 }).generate({
		timestamp
	});
}

describe('totp', () => {
	it('generates a Base32 secret and a provisioning URI', () => {
		const s = generateSecret();
		expect(s).toMatch(/^[A-Z2-7]+$/);
		expect(provisioningUri(s, 'jet')).toMatch(/^otpauth:\/\/totp\/EinVault:jet\?/);
	});

	it('verifies a current code and rejects a wrong one', () => {
		const s = generateSecret();
		const now = 1_700_000_000_000;
		const ok = verifyCode(s, codeFor(s, now), { at: now });
		expect(ok.valid).toBe(true);
		expect(typeof ok.step).toBe('number');
		expect(verifyCode(s, '000000', { at: now }).valid).toBe(false);
	});

	it('tolerates one step of drift but not two', () => {
		const s = generateSecret();
		const now = 1_700_000_000_000;
		expect(verifyCode(s, codeFor(s, now - 30_000), { at: now }).valid).toBe(true);
		expect(verifyCode(s, codeFor(s, now - 90_000), { at: now }).valid).toBe(false);
	});

	it('rejects a step at or below lastStep (replay guard)', () => {
		const s = generateSecret();
		const now = 1_700_000_000_000;
		const first = verifyCode(s, codeFor(s, now), { at: now });
		expect(first.valid).toBe(true);
		const replay = verifyCode(s, codeFor(s, now), { at: now, lastStep: first.step });
		expect(replay.valid).toBe(false);
	});

	it('generates 10 unique backup codes that hash and normalize stably', () => {
		const codes = generateBackupCodes();
		expect(codes).toHaveLength(10);
		expect(new Set(codes).size).toBe(10);
		expect(codes[0]).toMatch(/^[a-z0-9]{5}-[a-z0-9]{5}$/);
		expect(hashBackupCode(codes[0])).toBe(
			hashBackupCode(normalizeBackupCode(codes[0].toUpperCase()))
		);
	});
});
