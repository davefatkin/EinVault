import { describe, it, expect, beforeAll } from 'vitest';
import { eq } from 'drizzle-orm';
import { db, schema } from '$lib/server/db';
import {
	hashApiToken,
	createApiToken,
	listApiTokens,
	revokeApiToken,
	resolveApiToken,
	countApiTokens,
	MAX_API_TOKENS_PER_USER
} from './api-tokens';

describe('api tokens', () => {
	beforeAll(async () => {
		await db.insert(schema.users).values([
			{ id: 'at-u1', username: 'at-u1', displayName: 'U1', role: 'member' },
			{ id: 'at-u2', username: 'at-u2', displayName: 'U2', role: 'member' },
			{ id: 'at-inactive', username: 'at-inactive', displayName: 'X', isActive: false },
			{
				id: 'at-revoked',
				username: 'at-revoked',
				displayName: 'R',
				apiAccessEnabled: false
			}
		] as (typeof schema.users.$inferInsert)[]);
	});

	it('hash is deterministic and never the raw value', () => {
		expect(hashApiToken('abc')).toBe(hashApiToken('abc'));
		expect(hashApiToken('abc')).not.toBe('abc');
		expect(hashApiToken('abc')).toMatch(/^[0-9a-f]{64}$/);
	});

	it('create stores only the hash and resolve round-trips', async () => {
		const { id, raw } = await createApiToken('at-u1', 'Door button');
		expect(raw.startsWith('evk_')).toBe(true);

		const row = await db.query.apiTokens.findFirst({ where: eq(schema.apiTokens.id, id) });
		expect(row?.tokenHash).toBe(hashApiToken(raw));
		expect(row?.tokenHash).not.toContain(raw);

		const resolved = await resolveApiToken(raw);
		expect(resolved?.user.id).toBe('at-u1');
		expect(resolved?.tokenId).toBe(id);
	});

	it('unknown or empty tokens resolve to null', async () => {
		expect(await resolveApiToken('evk_not-a-real-token')).toBeNull();
		expect(await resolveApiToken('')).toBeNull();
	});

	it('list is scoped to the owner; revoke deletes and kills resolution', async () => {
		const { id, raw } = await createApiToken('at-u2', 'Garage');
		expect((await listApiTokens('at-u2')).map((t) => t.id)).toContain(id);
		expect((await listApiTokens('at-u1')).map((t) => t.id)).not.toContain(id);

		// Another user cannot revoke it
		expect(await revokeApiToken('at-u1', id)).toBe(false);
		expect(await resolveApiToken(raw)).not.toBeNull();

		expect(await revokeApiToken('at-u2', id)).toBe(true);
		expect(await resolveApiToken(raw)).toBeNull();
	});

	it('inactive users resolve to null', async () => {
		const { raw } = await createApiToken('at-inactive', 'Dead');
		expect(await resolveApiToken(raw)).toBeNull();
	});

	it('apiAccessEnabled=false blocks resolution and re-grant restores it', async () => {
		const { raw } = await createApiToken('at-revoked', 'Blocked');
		expect(await resolveApiToken(raw)).toBeNull();

		await db
			.update(schema.users)
			.set({ apiAccessEnabled: true })
			.where(eq(schema.users.id, 'at-revoked'));
		expect((await resolveApiToken(raw))?.user.id).toBe('at-revoked');

		await db
			.update(schema.users)
			.set({ apiAccessEnabled: false })
			.where(eq(schema.users.id, 'at-revoked'));
		expect(await resolveApiToken(raw)).toBeNull();
	});

	it('scope defaults to full and round-trips through resolve and list', async () => {
		const { id: fullId, raw: fullRaw } = await createApiToken('at-u1', 'Full');
		expect((await resolveApiToken(fullRaw))?.scope).toBe('full');

		const { id: writeId, raw: writeRaw } = await createApiToken('at-u1', 'Write', {
			scope: 'write'
		});
		expect((await resolveApiToken(writeRaw))?.scope).toBe('write');

		const listed = await listApiTokens('at-u1');
		expect(listed.find((t) => t.id === fullId)?.scope).toBe('full');
		expect(listed.find((t) => t.id === writeId)?.scope).toBe('write');
	});

	it('expired tokens resolve to null; future expiry still resolves', async () => {
		const { raw: expiredRaw } = await createApiToken('at-u1', 'Expired', {
			expiresAt: new Date(Date.now() - 1000)
		});
		expect(await resolveApiToken(expiredRaw)).toBeNull();

		const { raw: liveRaw } = await createApiToken('at-u1', 'Live', {
			expiresAt: new Date(Date.now() + 60_000)
		});
		expect((await resolveApiToken(liveRaw))?.user.id).toBe('at-u1');
	});

	it('countApiTokens reflects live token count for the owner', async () => {
		const before = await countApiTokens('at-count');
		expect(before).toBe(0);

		await db
			.insert(schema.users)
			.values({ id: 'at-count', username: 'at-count', displayName: 'C', role: 'member' });
		const { id } = await createApiToken('at-count', 'One');
		expect(await countApiTokens('at-count')).toBe(1);

		await revokeApiToken('at-count', id);
		expect(await countApiTokens('at-count')).toBe(0);

		expect(MAX_API_TOKENS_PER_USER).toBeGreaterThan(0);
	});
});
