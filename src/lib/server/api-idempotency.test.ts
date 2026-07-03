import { describe, it, expect, beforeAll } from 'vitest';
import { db, schema } from '$lib/server/db';
import { withIdempotency } from './api-idempotency';

const TOKEN = 'idem-tok';

function req(key?: string): Request {
	return new Request('http://x/api/logs', {
		method: 'POST',
		headers: key ? { 'idempotency-key': key } : {}
	});
}

describe('withIdempotency', () => {
	beforeAll(async () => {
		await db
			.insert(schema.users)
			.values({
				id: 'idem-u',
				username: 'idem-u',
				displayName: 'I',
				role: 'member'
			} as typeof schema.users.$inferInsert);
		await db.insert(schema.apiTokens).values({
			id: TOKEN,
			userId: 'idem-u',
			name: 't',
			tokenHash: 'idem-hash'
		} as typeof schema.apiTokens.$inferInsert);
	});

	it('runs produce once and replays the stored response for the same key+body', async () => {
		let calls = 0;
		const produce = async () => {
			calls++;
			return { status: 201, data: { n: calls } };
		};
		const r1 = await withIdempotency(
			{ request: req('k1'), tokenId: TOKEN, endpoint: 'logs', body: { a: 1 } },
			produce
		);
		const r2 = await withIdempotency(
			{ request: req('k1'), tokenId: TOKEN, endpoint: 'logs', body: { a: 1 } },
			produce
		);
		expect(calls).toBe(1);
		expect(r1.status).toBe(201);
		expect(await r2.json()).toEqual({ n: 1 });
	});

	it('409s when the same key is reused with a different body', async () => {
		await withIdempotency(
			{ request: req('k2'), tokenId: TOKEN, endpoint: 'logs', body: { a: 1 } },
			async () => ({ status: 201, data: { ok: true } })
		);
		const clash = await withIdempotency(
			{ request: req('k2'), tokenId: TOKEN, endpoint: 'logs', body: { a: 2 } },
			async () => ({ status: 201, data: { ok: true } })
		);
		expect(clash.status).toBe(409);
		expect((await clash.json()).code).toBe('idempotencyKeyReused');
	});

	it('scopes keys per endpoint (same key on a different endpoint is independent)', async () => {
		let calls = 0;
		const produce = async () => {
			calls++;
			return { status: 201, data: { calls } };
		};
		await withIdempotency(
			{ request: req('k3'), tokenId: TOKEN, endpoint: 'logs', body: {} },
			produce
		);
		await withIdempotency(
			{ request: req('k3'), tokenId: TOKEN, endpoint: 'journal', body: {} },
			produce
		);
		expect(calls).toBe(2);
	});

	it('does not store anything when no Idempotency-Key header is present', async () => {
		let calls = 0;
		const produce = async () => {
			calls++;
			return { status: 201, data: {} };
		};
		await withIdempotency({ request: req(), tokenId: TOKEN, endpoint: 'logs', body: {} }, produce);
		await withIdempotency({ request: req(), tokenId: TOKEN, endpoint: 'logs', body: {} }, produce);
		expect(calls).toBe(2);
	});
});
