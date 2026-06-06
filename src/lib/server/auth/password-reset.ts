import { db, schema } from '$lib/server/db';
import { and, eq, gt, lt } from 'drizzle-orm';
import { encodeBase32LowerCaseNoPadding, encodeHexLowerCase } from '@oslojs/encoding';
import { sha256 } from '@oslojs/crypto/sha2';

// Mirrors the session token scheme (src/lib/server/auth/session.ts): a random
// 20-byte base32 token travels in the email link; only its sha256 hex lands in
// the DB. sha256 (not bcrypt) is correct for high-entropy random tokens.

const RESET_TOKEN_DURATION_MS = 30 * 60 * 1000;
// DB-backed cooldown between token issues per user. Survives restarts, unlike
// the in-memory per-IP limiter in the forgot route.
const MIN_REISSUE_INTERVAL_MS = 60 * 1000;

function generateResetToken(): string {
	const bytes = new Uint8Array(20);
	crypto.getRandomValues(bytes);
	return encodeBase32LowerCaseNoPadding(bytes);
}

function tokenToId(token: string): string {
	return encodeHexLowerCase(sha256(new TextEncoder().encode(token)));
}

/**
 * Issue a reset token for a user. Returns the raw token for the email link,
 * or null when a token was already issued within the cooldown window.
 * Last-request-wins: any previous tokens for the user are deleted.
 */
export async function createResetToken(userId: string): Promise<string | null> {
	const recent = await db.query.passwordResetTokens.findFirst({
		where: and(
			eq(schema.passwordResetTokens.userId, userId),
			gt(schema.passwordResetTokens.createdAt, new Date(Date.now() - MIN_REISSUE_INTERVAL_MS))
		),
		columns: { id: true }
	});
	if (recent) return null;

	const token = generateResetToken();
	await db.delete(schema.passwordResetTokens).where(eq(schema.passwordResetTokens.userId, userId));
	await db.insert(schema.passwordResetTokens).values({
		id: tokenToId(token),
		userId,
		expiresAt: new Date(Date.now() + RESET_TOKEN_DURATION_MS)
	});
	return token;
}

/**
 * Validate a raw token. Returns the owning user or null. Expired rows and
 * tokens whose user became ineligible (deactivated, OIDC-only) are deleted on
 * sight, so a token can never bootstrap a password onto an SSO account.
 */
export async function validateResetToken(token: string) {
	const id = tokenToId(token);
	const row = await db.query.passwordResetTokens.findFirst({
		where: eq(schema.passwordResetTokens.id, id)
	});
	if (!row) return null;

	if (row.expiresAt.getTime() < Date.now()) {
		await db.delete(schema.passwordResetTokens).where(eq(schema.passwordResetTokens.id, id));
		return null;
	}

	const user = await db.query.users.findFirst({ where: eq(schema.users.id, row.userId) });
	if (!user || !user.isActive || !user.passwordHash) {
		await db.delete(schema.passwordResetTokens).where(eq(schema.passwordResetTokens.id, id));
		return null;
	}

	return { user };
}

/** Single-use enforcement: drop every reset token a user holds. */
export async function consumeUserResetTokens(userId: string): Promise<void> {
	await db.delete(schema.passwordResetTokens).where(eq(schema.passwordResetTokens.userId, userId));
}

/** Opportunistic cleanup, piggybacked on forgot-page requests. */
export async function cleanupExpiredResetTokens(): Promise<void> {
	await db
		.delete(schema.passwordResetTokens)
		.where(lt(schema.passwordResetTokens.expiresAt, new Date()));
}
