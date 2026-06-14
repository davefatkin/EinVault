import { db, schema } from '$lib/server/db';
import { eq } from 'drizzle-orm';

export type Require2fa = 'off' | 'admins' | 'everyone';
const SINGLETON = 'singleton';
const CACHE_TTL_MS = 10_000;

let cache: { value: { require2fa: Require2fa }; at: number } | null = null;

export async function getAppSettings(): Promise<{ require2fa: Require2fa }> {
	if (cache && Date.now() - cache.at < CACHE_TTL_MS) {
		return cache.value;
	}
	const row = await db.query.appSettings.findFirst({
		where: eq(schema.appSettings.id, SINGLETON)
	});
	const value: { require2fa: Require2fa } = row
		? { require2fa: row.require2fa }
		: { require2fa: 'off' };
	if (!row) {
		await db.insert(schema.appSettings).values({ id: SINGLETON }).onConflictDoNothing();
	}
	cache = { value, at: Date.now() };
	return value;
}

export async function setRequire2fa(value: Require2fa, updatedBy: string): Promise<void> {
	await db
		.insert(schema.appSettings)
		.values({ id: SINGLETON, require2fa: value, updatedAt: new Date(), updatedBy })
		.onConflictDoUpdate({
			target: schema.appSettings.id,
			set: { require2fa: value, updatedAt: new Date(), updatedBy }
		});
	cache = { value: { require2fa: value }, at: Date.now() };
}
