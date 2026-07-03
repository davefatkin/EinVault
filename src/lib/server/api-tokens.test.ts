import { describe, it, expect, beforeAll } from 'vitest';
import { eq } from 'drizzle-orm';
import { db, schema } from '$lib/server/db';
import {
	hashApiToken,
	createApiToken,
	listApiTokens,
	revokeApiToken,
	resolveApiToken
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
});
