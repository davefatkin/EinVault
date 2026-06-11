import { describe, it, expect } from 'vitest';
import { db, schema } from '$lib/server/db';
import { eq } from 'drizzle-orm';
import { enableFeedToken, disableFeedToken, userByFeedToken, hashFeedToken } from './calendarToken';

async function makeUser(id: string) {
	await db.insert(schema.users).values({ id, username: id, displayName: id, role: 'member' });
}

describe('calendarToken', () => {
	it('enable stores a hash (not the raw) and resolves by raw token', async () => {
		await makeUser('u-cal-1');
		const raw = await enableFeedToken('u-cal-1');
		const row = await db.query.users.findFirst({ where: eq(schema.users.id, 'u-cal-1') });
		expect(row?.calendarFeedToken).toBe(hashFeedToken(raw));
		expect(row?.calendarFeedToken).not.toBe(raw);
		const found = await userByFeedToken(raw);
		expect(found?.id).toBe('u-cal-1');
	});
	it('disable clears the token and lookups fail', async () => {
		await makeUser('u-cal-2');
		const raw = await enableFeedToken('u-cal-2');
		await disableFeedToken('u-cal-2');
		expect(await userByFeedToken(raw)).toBeNull();
	});
	it('empty/unknown token → null', async () => {
		expect(await userByFeedToken('')).toBeNull();
		expect(await userByFeedToken('nope')).toBeNull();
	});
	it('a deactivated user resolves to null (feed dies on deactivation)', async () => {
		await makeUser('u-cal-3');
		const raw = await enableFeedToken('u-cal-3');
		expect((await userByFeedToken(raw))?.id).toBe('u-cal-3');
		await db.update(schema.users).set({ isActive: false }).where(eq(schema.users.id, 'u-cal-3'));
		expect(await userByFeedToken(raw)).toBeNull();
	});
});
