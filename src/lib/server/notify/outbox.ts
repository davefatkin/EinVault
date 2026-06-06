import { and, asc, eq, inArray, lt, sql } from 'drizzle-orm';
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
	userId: string,
	channel: OutboxChannel
): string {
	return `shift:${shiftId}:${kind === 'shiftStart' ? 'start' : 'end'}:${userId}:${channel}`;
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
 */
export async function claimNext(): Promise<ClaimedNotification | null> {
	for (;;) {
		const [candidate] = await db
			.select({ id: schema.notificationOutbox.id })
			.from(schema.notificationOutbox)
			.where(eq(schema.notificationOutbox.status, 'queued'))
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

/**
 * Remove the row entirely so the dedupe key frees up and a producer can
 * re-create it later. Used when a shift is rescheduled beyond the lead window
 * before its alert went out — the alert should fire again when the new time
 * approaches, which a terminal 'skipped' row would block.
 */
export async function deleteRow(id: string): Promise<void> {
	await db.delete(schema.notificationOutbox).where(eq(schema.notificationOutbox.id, id));
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
