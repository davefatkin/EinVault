import { createHash } from 'node:crypto';
import { json } from '@sveltejs/kit';
import { and, eq, lt } from 'drizzle-orm';
import { db, schema } from '$lib/server/db';
import { generateId } from '$lib/server/utils';

// Idempotency-Key header bound: long enough for a UUID or a device's own scheme,
// short enough that a hostile header can't bloat the row.
const MAX_KEY_LEN = 200;
// Stored keys older than this are pruned opportunistically so the table stays
// bounded per token even for devices that mint a fresh key per request.
const KEY_TTL_MS = 7 * 24 * 60 * 60 * 1000;
// Sentinel status on a freshly reserved (in-flight) row, before `produce` runs.
const PENDING = 0;

function hashBody(body: unknown): string {
	return createHash('sha256')
		.update(JSON.stringify(body ?? null))
		.digest('hex');
}

function inFlight(): Response {
	return json(
		{ code: 'idempotencyInFlight', message: 'A request with this Idempotency-Key is in progress.' },
		{ status: 409 }
	);
}

// Wrap a write handler with optional idempotency keyed on the Idempotency-Key
// header (scoped per token + endpoint). With no header, runs normally. With a
// header: the key row is reserved BEFORE `produce` runs, so two concurrent
// retries can't both execute the side effect — the first reserves and runs, the
// loser sees the reservation and gets a retryable 409 (in-flight) or the stored
// replay. A retry with the same body replays; a retry with a DIFFERENT body is a
// 409. `produce` may throw (e.g. throwCareError); a thrown error rolls back the
// reservation so a legitimate retry isn't permanently blocked.
export async function withIdempotency(
	opts: { request: Request; tokenId: string; endpoint: string; body: unknown },
	produce: () => Promise<{ status: number; data: unknown }>
): Promise<Response> {
	const key = opts.request.headers.get('idempotency-key')?.trim();
	if (!key) {
		const { status, data } = await produce();
		return json(data, { status });
	}
	if (key.length > MAX_KEY_LEN) {
		return json(
			{
				code: 'idempotencyKeyTooLong',
				message: `Idempotency-Key exceeds ${MAX_KEY_LEN} characters.`
			},
			{ status: 400 }
		);
	}

	const requestHash = hashBody(opts.body);
	const where = and(
		eq(schema.apiIdempotencyKeys.tokenId, opts.tokenId),
		eq(schema.apiIdempotencyKeys.endpoint, opts.endpoint),
		eq(schema.apiIdempotencyKeys.key, key)
	);

	// Reserve the key first. onConflictDoNothing + returning: a non-empty result
	// means we won the race and own the reservation; empty means it already exists.
	const rowId = generateId(15);
	const reserved = await db
		.insert(schema.apiIdempotencyKeys)
		.values({
			id: rowId,
			tokenId: opts.tokenId,
			endpoint: opts.endpoint,
			key,
			requestHash,
			responseJson: '',
			status: PENDING
		})
		.onConflictDoNothing()
		.returning({ id: schema.apiIdempotencyKeys.id });

	if (reserved.length === 0) {
		const existing = await db.query.apiIdempotencyKeys.findFirst({ where });
		// Row vanished between the conflict and this read (e.g. concurrent rollback).
		if (!existing) return inFlight();
		if (existing.requestHash !== requestHash) {
			return json(
				{
					code: 'idempotencyKeyReused',
					message: 'Idempotency-Key reused with a different request body.'
				},
				{ status: 409 }
			);
		}
		// Same key + body, but the original call is still running: tell the client
		// to retry rather than executing the side effect a second time.
		if (existing.status === PENDING) return inFlight();
		return new Response(existing.responseJson, {
			status: existing.status,
			headers: { 'content-type': 'application/json' }
		});
	}

	// We own the reservation. Run the side effect, then finalize the row.
	let result: { status: number; data: unknown };
	try {
		result = await produce();
	} catch (err) {
		await db.delete(schema.apiIdempotencyKeys).where(eq(schema.apiIdempotencyKeys.id, rowId));
		throw err;
	}

	const responseJson = JSON.stringify(result.data);
	await db
		.update(schema.apiIdempotencyKeys)
		.set({ responseJson, status: result.status })
		.where(eq(schema.apiIdempotencyKeys.id, rowId));

	// Opportunistic prune of this token's stale keys; keeps the table bounded.
	const cutoff = new Date(Date.now() - KEY_TTL_MS);
	await db
		.delete(schema.apiIdempotencyKeys)
		.where(
			and(
				eq(schema.apiIdempotencyKeys.tokenId, opts.tokenId),
				lt(schema.apiIdempotencyKeys.createdAt, cutoff)
			)
		);

	return new Response(responseJson, {
		status: result.status,
		headers: { 'content-type': 'application/json' }
	});
}
