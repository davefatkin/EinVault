import { and, asc, eq, inArray, lt, notInArray, sql } from 'drizzle-orm';
import { db, schema } from '$lib/server/db';
import { generateId } from '$lib/server/utils';
import type { OutboxPayload } from '$lib/server/db/schema';

// Give up on a row after this many claims. The counter increments on each
// atomic claim, so a row that keeps failing (SMTP rejects, render crash)
// becomes terminal 'failed' instead of retrying forever. Same shape as the
// video worker's cap.
export const MAX_ATTEMPTS = 3;

// Sent/skipped/failed rows are kept this long for operator inspection.
const RETENTION_MS = 7 * 24 * 60 * 60 * 1000;

export type OutboxChannel = 'email' | 'ntfy' | 'apprise';

export function reminderDedupeKey(
	reminderId: string,
	dueAt: Date,
	userId: string,
	channel: OutboxChannel
): string {
	return `reminder:${reminderId}:${Math.floor(dueAt.getTime() / 1000)}:${userId}:${channel}`;
}

export function shiftDedupeKey(
	shiftId: string,
	kind: 'shiftStart' | 'shiftEnd',
	boundary: Date,
	userId: string,
	channel: OutboxChannel
): string {
	return `shift:${shiftId}:${kind === 'shiftStart' ? 'start' : 'end'}:${Math.floor(boundary.getTime() / 1000)}:${userId}:${channel}`;
}

export interface EnqueueRow {
	dedupeKey: string;
	userId: string;
	channel: OutboxChannel;
	payload: OutboxPayload;
}

/**
 * Idempotent enqueue: the unique dedupe index swallows rows already produced
 * by an earlier scan or a pre-restart process. Returns how many were new.
 */
export async function enqueue(rows: EnqueueRow[]): Promise<number> {
	if (rows.length === 0) return 0;
	const inserted = await db
		.insert(schema.notificationOutbox)
		.values(rows.map((r) => ({ id: generateId(15), ...r })))
		.onConflictDoNothing({ target: schema.notificationOutbox.dedupeKey })
		.returning({ id: schema.notificationOutbox.id });
	return inserted.length;
}

export type ClaimedNotification = typeof schema.notificationOutbox.$inferSelect;

/**
 * Atomically claim the oldest queued row: select a candidate, then transition
 * it queued -> claimed guarded on its still being queued (incrementing the
 * attempt counter). Loops past candidates lost to a race; returns null only
 * when the queue is empty. Mirrors the video worker's claimNext.
 *
 * Pass excludeIds to skip rows that already failed this pass — retries get one
 * attempt per scan, so the 60s tick acts as retry backoff.
 */
export async function claimNext(
	excludeIds?: ReadonlySet<string>
): Promise<ClaimedNotification | null> {
	for (;;) {
		const where = excludeIds?.size
			? and(
					eq(schema.notificationOutbox.status, 'queued'),
					notInArray(schema.notificationOutbox.id, [...excludeIds])
				)
			: eq(schema.notificationOutbox.status, 'queued');
		const [candidate] = await db
			.select({ id: schema.notificationOutbox.id })
			.from(schema.notificationOutbox)
			.where(where)
			.orderBy(asc(schema.notificationOutbox.createdAt))
			.limit(1);
		if (!candidate) return null;

		const [claimed] = await db
			.update(schema.notificationOutbox)
			.set({ status: 'claimed', attempts: sql`${schema.notificationOutbox.attempts} + 1` })
			.where(
				and(
					eq(schema.notificationOutbox.id, candidate.id),
					eq(schema.notificationOutbox.status, 'queued')
				)
			)
			.returning();
		if (claimed) return claimed;
	}
}

export async function markSent(id: string): Promise<void> {
	await db
		.update(schema.notificationOutbox)
		.set({ status: 'sent', sentAt: new Date() })
		.where(eq(schema.notificationOutbox.id, id));
}

/** Conditions no longer hold (reminder completed, user opted out) — not an error. */
export async function markSkipped(id: string): Promise<void> {
	await db
		.update(schema.notificationOutbox)
		.set({ status: 'skipped' })
		.where(eq(schema.notificationOutbox.id, id));
}

/** Retry if attempts remain, else terminal failure. */
export async function markFailedOrRequeue(row: ClaimedNotification): Promise<void> {
	await db
		.update(schema.notificationOutbox)
		.set({ status: row.attempts >= MAX_ATTEMPTS ? 'failed' : 'queued' })
		.where(eq(schema.notificationOutbox.id, row.id));
}

/** Boot recovery: rows orphaned mid-send by a crash go back in the queue. */
export async function recoverOrphanedClaims(): Promise<number> {
	const reset = await db
		.update(schema.notificationOutbox)
		.set({ status: 'queued' })
		.where(eq(schema.notificationOutbox.status, 'claimed'))
		.returning({ id: schema.notificationOutbox.id });
	return reset.length;
}

/** Drop terminal rows older than the retention window. */
export async function cleanupOldRows(): Promise<void> {
	await db
		.delete(schema.notificationOutbox)
		.where(
			and(
				inArray(schema.notificationOutbox.status, ['sent', 'skipped', 'failed']),
				lt(schema.notificationOutbox.createdAt, new Date(Date.now() - RETENTION_MS))
			)
		);
}
