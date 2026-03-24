import { db, schema } from '$lib/server/db';
import { eq, lt } from 'drizzle-orm';
import { encodeBase32LowerCaseNoPadding, encodeHexLowerCase } from '@oslojs/encoding';
import { sha256 } from '@oslojs/crypto/sha2';

export function generateSessionToken(): string {
	const bytes = new Uint8Array(20);
	crypto.getRandomValues(bytes);
	return encodeBase32LowerCaseNoPadding(bytes);
}

function tokenToSessionId(token: string): string {
	return encodeHexLowerCase(sha256(new TextEncoder().encode(token)));
}

const SESSION_DURATION_MS = 30 * 24 * 60 * 60 * 1000;
const REFRESH_THRESHOLD_MS = 15 * 24 * 60 * 60 * 1000;

export async function createSession(token: string, userId: string) {
	const sessionId = tokenToSessionId(token);
	const expiresAt = new Date(Date.now() + SESSION_DURATION_MS);
	await db.insert(schema.sessions).values({ id: sessionId, userId, expiresAt });
	return { id: sessionId, userId, expiresAt };
}

export async function validateSessionToken(token: string) {
	const sessionId = tokenToSessionId(token);

	const session = await db.query.sessions.findFirst({
		where: eq(schema.sessions.id, sessionId)
	});
	if (!session) return null;

	const now = Date.now();
	if (session.expiresAt.getTime() < now) {
		await db.delete(schema.sessions).where(eq(schema.sessions.id, sessionId));
		return null;
	}

	const user = await db.query.users.findFirst({
		where: eq(schema.users.id, session.userId),
		columns: { passwordHash: false }
	});
	if (!user || !user.isActive) {
		await db.delete(schema.sessions).where(eq(schema.sessions.id, sessionId));
		return null;
	}

	if (session.expiresAt.getTime() - now < REFRESH_THRESHOLD_MS) {
		const newExpiry = new Date(now + SESSION_DURATION_MS);
		await db
			.update(schema.sessions)
			.set({ expiresAt: newExpiry })
			.where(eq(schema.sessions.id, sessionId));
		session.expiresAt = newExpiry;
	}

	if (Math.random() < 0.01) {
		cleanupExpiredSessions().catch((err) =>
			console.error('[einvault] session cleanup failed:', err)
		);
	}

	return { session, user };
}

export async function cleanupExpiredSessions(): Promise<void> {
	await db.delete(schema.sessions).where(lt(schema.sessions.expiresAt, new Date()));
}

export async function invalidateSession(sessionId: string) {
	await db.delete(schema.sessions).where(eq(schema.sessions.id, sessionId));
}

export async function invalidateAllUserSessions(userId: string) {
	await db.delete(schema.sessions).where(eq(schema.sessions.userId, userId));
}

export const SESSION_COOKIE_NAME = 'einvault_session';

export function makeSessionCookieOptions(expiresAt: Date, secure: boolean) {
	return { httpOnly: true, sameSite: 'strict' as const, secure, expires: expiresAt, path: '/' };
}

export function makeBlankCookieOptions(secure: boolean) {
	return { httpOnly: true, sameSite: 'strict' as const, secure, maxAge: 0, path: '/' };
}
