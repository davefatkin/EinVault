import { createHash } from 'node:crypto';
import { json } from '@sveltejs/kit';
import { and, eq } from 'drizzle-orm';
import { db, schema } from '$lib/server/db';
import { generateId } from '$lib/server/utils';

function hashBody(body: unknown): string {
	return createHash('sha256')
		.update(JSON.stringify(body ?? null))
		.digest('hex');
}

// Wrap a write handler with optional idempotency keyed on the Idempotency-Key
// header (scoped per token + endpoint). With no header, runs normally. With a
// header: a first call runs `produce` and stores its response; a retry with the
// same body replays that response; a retry with a DIFFERENT body is a 409.
// `produce` may throw (e.g. throwCareError) — thrown errors are never stored.
export async function withIdempotency(
	opts: { request: Request; tokenId: string; endpoint: string; body: unknown },
	produce: () => Promise<{ status: number; data: unknown }>
): Promise<Response> {
	const key = opts.request.headers.get('idempotency-key')?.trim();
	if (!key) {
		const { status, data } = await produce();
		return json(data, { status });
	}

	const requestHash = hashBody(opts.body);
	const existing = await db.query.apiIdempotencyKeys.findFirst({
		where: and(
			eq(schema.apiIdempotencyKeys.tokenId, opts.tokenId),
			eq(schema.apiIdempotencyKeys.endpoint, opts.endpoint),
			eq(schema.apiIdempotencyKeys.key, key)
		)
	});
	if (existing) {
		if (existing.requestHash !== requestHash) {
			return json(
				{
					code: 'idempotencyKeyReused',
					message: 'Idempotency-Key reused with a different request body.'
				},
				{ status: 409 }
			);
		}
		return new Response(existing.responseJson, {
			status: existing.status,
			headers: { 'content-type': 'application/json' }
		});
	}

	const { status, data } = await produce();
	const responseJson = JSON.stringify(data);
	await db
		.insert(schema.apiIdempotencyKeys)
		.values({
			id: generateId(15),
			tokenId: opts.tokenId,
			endpoint: opts.endpoint,
			key,
			requestHash,
			responseJson,
			status
		})
		.onConflictDoNothing();
	return new Response(responseJson, {
		status,
		headers: { 'content-type': 'application/json' }
	});
}
