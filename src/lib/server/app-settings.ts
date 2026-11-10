import { db, schema } from '#lib/server/db/index.js';
import { eq } from 'drizzle-orm';

export type Require2fa = 'off' | 'admins' | 'everyone';
const SINGLETON = 'singleton';
const CACHE_TTL_MS = 10_000;

type AppSettingsValue = { require2fa: Require2fa; currency: string };

let cache: { value: AppSettingsValue; at: number } | null = null;

export async function getAppSettings(): Promise<AppSettingsValue> {
	if (cache && Date.now() - cache.at < CACHE_TTL_MS) {
		return cache.value;
	}
	const row = await db.query.appSettings.findFirst({
		where: eq(schema.appSettings.id, SINGLETON)
	});
	const value: AppSettingsValue = row
		? { require2fa: row.require2fa, currency: row.currency }
		: { require2fa: 'off', currency: 'USD' };
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
	cache = null;
}

export async function setCurrency(code: string, updatedBy: string): Promise<void> {
	await db
		.insert(schema.appSettings)
		.values({ id: SINGLETON, currency: code, updatedAt: new Date(), updatedBy })
		.onConflictDoUpdate({
			target: schema.appSettings.id,
			set: { currency: code, updatedAt: new Date(), updatedBy }
		});
	cache = null;
}
