import { describe, it, expect } from 'vitest';
import { eq } from 'drizzle-orm';
import { db, schema } from '$lib/server/db';
import {
	generateSessionToken,
	createSession,
	validateSessionToken,
	invalidateSession
} from './session';

async function insertUser(id: string, opts: { isActive?: boolean } = {}) {
	await db.insert(schema.users).values({
		id,
		username: `user-${id}`,
		displayName: `User ${id}`,
		role: 'member',
		isActive: opts.isActive ?? true
	});
}

describe('generateSessionToken', () => {
	it('returns 32-char lowercase base32, unique per call', () => {
		const a = generateSessionToken();
		const b = generateSessionToken();
		expect(a).toMatch(/^[a-z2-7]{32}$/);
		expect(a).not.toBe(b);
	});
});

describe('validateSessionToken', () => {
	it('returns session and user for a valid token', async () => {
		await insertUser('u1');
		const token = generateSessionToken();
		await createSession(token, 'u1');
		const result = await validateSessionToken(token);
		expect(result).not.toBeNull();
		expect(result!.user.id).toBe('u1');
		expect(result!.user).not.toHaveProperty('passwordHash');
	});

	it('returns null for an unknown token', async () => {
		expect(await validateSessionToken(generateSessionToken())).toBeNull();
	});

	it('deletes and rejects an expired session', async () => {
		await insertUser('u2');
		const token = generateSessionToken();
		const session = await createSession(token, 'u2');
		await db
			.update(schema.sessions)
			.set({ expiresAt: new Date(Date.now() - 1000) })
			.where(eq(schema.sessions.id, session.id));
		expect(await validateSessionToken(token)).toBeNull();
		expect(await validateSessionToken(token)).toBeNull(); // row gone, still null
	});

	it('rejects sessions of deactivated users', async () => {
		await insertUser('u3', { isActive: false });
		const token = generateSessionToken();
		await createSession(token, 'u3');
		expect(await validateSessionToken(token)).toBeNull();
	});

	it('invalidateSession kills the session', async () => {
		await insertUser('u4');
		const token = generateSessionToken();
		const session = await createSession(token, 'u4');
		await invalidateSession(session.id);
		expect(await validateSessionToken(token)).toBeNull();
	});
});
