import { describe, it, expect, beforeAll, afterEach, vi } from 'vitest';
import { eq } from 'drizzle-orm';
import { TOTP, Secret } from 'otpauth';

vi.mock('$env/dynamic/private', () => ({
	env: new Proxy({} as Record<string, string | undefined>, {
		get: (_t, k: string) => process.env[k]
	})
}));

beforeAll(() => {
	process.env.TWOFA_ENC_KEY = Buffer.from(new Uint8Array(32).fill(9)).toString('base64');
});

afterEach(() => {
	vi.useRealTimers();
});

function codeFor(secret: string, timestamp = Date.now()): string {
	return new TOTP({ secret: Secret.fromBase32(secret), digits: 6, period: 30 }).generate({
		timestamp
	});
}

describe('enrollment', () => {
	it('begins, confirms, disables', async () => {
		const { db, schema } = await import('$lib/server/db');
		const { beginEnrollment, confirmEnrollment, disableTwoFactor } = await import('./enrollment');
		await db
			.insert(schema.users)
			.values({ id: 'u1', username: 'u1', displayName: 'U1', role: 'member' });

		// Pin time so confirm and the replay-guard step are deterministic
		const baseTs = Date.now();
		vi.useFakeTimers();
		vi.setSystemTime(baseTs);

		const { manualKey } = await beginEnrollment('u1', 'u1');

		const codes = await confirmEnrollment('u1', codeFor(manualKey, baseTs));
		expect(codes).toHaveLength(10);

		let row = await db.query.users.findFirst({ where: eq(schema.users.id, 'u1') });
		expect(row?.totpEnabledAt).toBeTruthy();

		// Advance 60 s so disableTwoFactor's internal Date.now() lands on a later
		// step than the one stored as totpLastStep — avoiding the replay guard.
		vi.setSystemTime(baseTs + 60_000);
		const okDisable = await disableTwoFactor('u1', codeFor(manualKey, baseTs + 60_000));
		expect(okDisable).toBe(true);

		row = await db.query.users.findFirst({ where: eq(schema.users.id, 'u1') });
		expect(row?.totpSecret).toBeNull();
	});
});
