import { describe, it, expect } from 'vitest';
import { eq } from 'drizzle-orm';
import { db, schema } from '$lib/server/db';
import {
	generateSessionToken,
	createSession,
	validateSessionToken,
	invalidateSession,
	invalidateAllUserSessions,
	cleanupExpiredSessions
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

	it('extends expiry when a session nears its refresh threshold', async () => {
		await insertUser('u5');
		const token = generateSessionToken();
		const session = await createSession(token, 'u5');
		const nearExpiry = new Date(Date.now() + 10 * 24 * 60 * 60 * 1000); // inside 15-day threshold
		await db
			.update(schema.sessions)
			.set({ expiresAt: nearExpiry })
			.where(eq(schema.sessions.id, session.id));
		const result = await validateSessionToken(token);
		expect(result).not.toBeNull();
		expect(result!.session.expiresAt.getTime()).toBeGreaterThan(nearExpiry.getTime());
	});
});

describe('invalidateAllUserSessions', () => {
	it('removes every session for that user only', async () => {
		await insertUser('u6');
		await insertUser('u7');
		const t1 = generateSessionToken();
		const t2 = generateSessionToken();
		const t3 = generateSessionToken();
		await createSession(t1, 'u6');
		await createSession(t2, 'u6');
		await createSession(t3, 'u7');

		await invalidateAllUserSessions('u6');

		expect(await validateSessionToken(t1)).toBeNull();
		expect(await validateSessionToken(t2)).toBeNull();
		expect((await validateSessionToken(t3))!.user.id).toBe('u7');
	});
});

describe('cleanupExpiredSessions', () => {
	it('removes only expired rows', async () => {
		await insertUser('u8');
		const live = generateSessionToken();
		const dead = generateSessionToken();
		const liveSession = await createSession(live, 'u8');
		const deadSession = await createSession(dead, 'u8');
		await db
			.update(schema.sessions)
			.set({ expiresAt: new Date(Date.now() - 1000) })
			.where(eq(schema.sessions.id, deadSession.id));

		await cleanupExpiredSessions();

		const rows = await db.query.sessions.findMany();
		const ids = rows.map((r) => r.id);
		expect(ids).toContain(liveSession.id);
		expect(ids).not.toContain(deadSession.id);
	});
});
