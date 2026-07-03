import { randomBytes } from 'node:crypto';
import { sha256 } from '@oslojs/crypto/sha2';
import { encodeHexLowerCase } from '@oslojs/encoding';
import { and, eq } from 'drizzle-orm';
import { db, schema } from '$lib/server/db';
import { generateId } from '$lib/server/utils';

// Hash mirrors the session-token model: store sha256(raw), never the raw value.
export function hashApiToken(token: string): string {
	return encodeHexLowerCase(sha256(new TextEncoder().encode(token)));
}

// Create a named token, store its hash, return the raw token ONCE for display.
export async function createApiToken(
	userId: string,
	name: string
): Promise<{ id: string; raw: string }> {
	const raw = 'evk_' + randomBytes(32).toString('base64url');
	const id = generateId(15);
	await db.insert(schema.apiTokens).values({
		id,
		userId,
		name,
		tokenHash: hashApiToken(raw)
	});
	return { id, raw };
}

export async function listApiTokens(userId: string) {
	return db.query.apiTokens.findMany({
		where: eq(schema.apiTokens.userId, userId),
		columns: { id: true, name: true, createdAt: true, lastUsedAt: true },
		orderBy: (t, { desc }) => [desc(t.createdAt)]
	});
}

// Revoke = hard delete, scoped by owner so users can't delete others' tokens.
export async function revokeApiToken(userId: string, id: string): Promise<boolean> {
	const result = await db
		.delete(schema.apiTokens)
		.where(and(eq(schema.apiTokens.id, id), eq(schema.apiTokens.userId, userId)));
	return result.changes > 0;
}

// Resolve a raw token to its owning user, or null. Lookup is by hash, so match
// timing leaks nothing about a valid raw token (same reasoning as session.ts).
// Requires the user to be active AND to hold API access — the admin-controlled
// apiAccessEnabled flag disables every token immediately without deleting them.
export async function resolveApiToken(
	raw: string
): Promise<{ user: typeof schema.users.$inferSelect; tokenId: string } | null> {
	if (!raw) return null;
	const token = await db.query.apiTokens.findFirst({
		where: eq(schema.apiTokens.tokenHash, hashApiToken(raw)),
		with: { user: true }
	});
	if (!token) return null;
	if (!token.user.isActive || !token.user.apiAccessEnabled) return null;
	return { user: token.user, tokenId: token.id };
}

// lastUsedAt is an operational signal, not an audit log: throttle writes to at
// most one per token per minute so a chatty device doesn't hammer the DB.
const lastTouched = new Map<string, number>();
const TOUCH_INTERVAL_MS = 60 * 1000;

export async function touchApiToken(tokenId: string): Promise<void> {
	const now = Date.now();
	const prev = lastTouched.get(tokenId);
	if (prev && now - prev < TOUCH_INTERVAL_MS) return;
	lastTouched.set(tokenId, now);
	await db
		.update(schema.apiTokens)
		.set({ lastUsedAt: new Date(now) })
		.where(eq(schema.apiTokens.id, tokenId));
}
