import { describe, it, expect, beforeAll, vi } from 'vitest';

vi.mock('$env/dynamic/private', () => ({
	env: new Proxy({} as Record<string, string | undefined>, {
		get: (_t, key: string) => process.env[key]
	})
}));

beforeAll(() => {
	process.env.TWOFA_ENC_KEY = Buffer.from(new Uint8Array(32).fill(7)).toString('base64');
});

describe('totp-crypto', () => {
	it('round-trips a secret', async () => {
		const { encryptSecret, decryptSecret } = await import('./totp-crypto');
		const plain = 'JBSWY3DPEHPK3PXP';
		const stored = encryptSecret(plain);
		expect(stored).not.toContain(plain);
		expect(decryptSecret(stored)).toBe(plain);
	});

	it('rejects tampered ciphertext', async () => {
		const { encryptSecret, decryptSecret } = await import('./totp-crypto');
		const stored = encryptSecret('JBSWY3DPEHPK3PXP');
		const [iv, ct, tag] = stored.split(':');
		const flipped = `${iv}:${ct.slice(0, -2)}aa:${tag}`;
		expect(() => decryptSecret(flipped)).toThrow();
	});

	it('throws a clear error when the key is missing', async () => {
		delete process.env.TWOFA_ENC_KEY;
		const mod = await import('./totp-crypto');
		expect(() => mod.encryptSecret('x')).toThrow(/TWOFA_ENC_KEY/);
		process.env.TWOFA_ENC_KEY = Buffer.from(new Uint8Array(32).fill(7)).toString('base64');
	});
});
