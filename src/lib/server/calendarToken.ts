import { randomBytes } from 'node:crypto';
import { sha256 } from '@oslojs/crypto/sha2';
import { encodeHexLowerCase } from '@oslojs/encoding';
import { eq } from 'drizzle-orm';
import { db, schema } from '$lib/server/db';

// Hash mirrors the session-token model: store sha256(raw), never the raw value.
export function hashFeedToken(token: string): string {
	return encodeHexLowerCase(sha256(new TextEncoder().encode(token)));
}

// Generate a fresh token, store its hash, return the raw token ONCE for display.
export async function enableFeedToken(userId: string): Promise<string> {
	const raw = randomBytes(32).toString('base64url');
	await db
		.update(schema.users)
		.set({ calendarFeedToken: hashFeedToken(raw) })
		.where(eq(schema.users.id, userId));
	return raw;
}

export async function disableFeedToken(userId: string): Promise<void> {
	await db
		.update(schema.users)
		.set({ calendarFeedToken: null })
		.where(eq(schema.users.id, userId));
}

// Resolve a raw token to its owning user, or null. Lookup is by hash, so match
// timing leaks nothing about a valid raw token (same reasoning as session.ts).
export async function userByFeedToken(token: string) {
	if (!token) return null;
	const user = await db.query.users.findFirst({
		where: eq(schema.users.calendarFeedToken, hashFeedToken(token))
	});
	return user ?? null;
}
