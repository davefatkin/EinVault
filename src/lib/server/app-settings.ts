import { db, schema } from '$lib/server/db';
import { eq } from 'drizzle-orm';

export type Require2fa = 'off' | 'admins' | 'everyone';
const SINGLETON = 'singleton';

export async function getAppSettings(): Promise<{ require2fa: Require2fa }> {
	const row = await db.query.appSettings.findFirst({
		where: eq(schema.appSettings.id, SINGLETON)
	});
	if (row) return { require2fa: row.require2fa };
	await db.insert(schema.appSettings).values({ id: SINGLETON }).onConflictDoNothing();
	return { require2fa: 'off' };
}

export async function setRequire2fa(value: Require2fa, updatedBy: string): Promise<void> {
	await db
		.insert(schema.appSettings)
		.values({ id: SINGLETON, require2fa: value, updatedAt: new Date(), updatedBy })
		.onConflictDoUpdate({
			target: schema.appSettings.id,
			set: { require2fa: value, updatedAt: new Date(), updatedBy }
		});
}
