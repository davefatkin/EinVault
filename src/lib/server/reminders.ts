import { db, schema } from '$lib/server/db';
import { and, desc, eq, gt, inArray, isNotNull, isNull, lt, or, sql } from 'drizzle-orm';
import { generateId } from '$lib/server/utils';
import {
	clampDayOfMonth,
	unpackMonthDay,
	type RecurrenceUnit,
	type RecurrenceAnchor
} from '$lib/reminderRecurrence';

type Reminder = typeof schema.reminders.$inferSelect;
type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/**
 * Compute the next due date for a recurring reminder. Uses wall-clock
 * arithmetic so a "9am every Monday" reminder stays at 9am across DST.
 * Clamps short-month and Feb-29 cases (Jan 31 → Feb 28/29).
 *
 * For unit=month with anchor=interval, `recurrenceAnchorValue` carries the
 * original day-of-month from the series origin so consecutive advancements
 * over short months don't drift (e.g. Jan 31 → Feb 28 → Mar 31, not Mar 28).
 * For unit=year similar logic applies via the packed MMDD anchor.
 */
export function computeNextDueAt(reminder: Reminder): Date | null {
	if (!reminder.isRecurring) return null;

	const unit: RecurrenceUnit | null = reminder.recurrenceUnit ?? null;
	const interval = reminder.recurrenceInterval ?? null;
	const anchor: RecurrenceAnchor = reminder.recurrenceAnchor ?? 'interval';
	const anchorValue = reminder.recurrenceAnchorValue;

	if (!unit || !interval || interval < 1) return null;

	const next = new Date(reminder.dueAt);

	if (unit === 'day') {
		next.setDate(next.getDate() + interval);
		return next;
	}

	if (unit === 'week') {
		next.setDate(next.getDate() + interval * 7);
		return next;
	}

	if (unit === 'month') {
		const desiredDay = anchorValue ?? reminder.dueAt.getDate();
		const targetMonth = next.getMonth() + interval;
		const targetYear = next.getFullYear() + Math.floor(targetMonth / 12);
		const normalizedMonth = ((targetMonth % 12) + 12) % 12;
		next.setFullYear(targetYear, normalizedMonth, 1);
		next.setDate(clampDayOfMonth(targetYear, normalizedMonth, desiredDay));
		return next;
	}

	// unit === 'year': for both 'interval' (anchored to series origin) and
	// 'day_of_year' (explicit MMDD) the anchor value packs month + day the same
	// way, so unpacking is identical.
	let desiredMonth = next.getMonth();
	let desiredDay = next.getDate();
	if (anchorValue && (anchor === 'day_of_year' || anchor === 'interval')) {
		const unpacked = unpackMonthDay(anchorValue);
		desiredMonth = unpacked.monthIdx;
		desiredDay = unpacked.day;
	}
	const targetYear = next.getFullYear() + interval;
	next.setFullYear(targetYear, desiredMonth, 1);
	next.setDate(clampDayOfMonth(targetYear, desiredMonth, desiredDay));
	return next;
}

type ResolveResult = {
	completedAt: Date;
	nextReminderId: string | null;
	nextDueAt: Date | null;
	pillsLeft: number | null;
};

function resolveReminder(
	reminder: Reminder,
	userId: string,
	outcome: 'completed' | 'skipped'
): ResolveResult | null | 'noPillsLeft' {
	const r = schema.reminders;
	const completedAt = new Date();
	// A completed dose burns one pill; a skip leaves the count alone. Both read
	// and write the live column rather than the caller's snapshot, so a refill
	// saved after the snapshot was loaded still counts. NULL - 1 stays NULL, so
	// untracked reminders pass through unchanged.
	const consumes = outcome === 'completed';
	return db.transaction((tx) => {
		const [row] = tx
			.update(r)
			.set({
				completedAt,
				completedBy: userId,
				outcome,
				...(consumes ? { pillsLeft: sql`${r.pillsLeft} - 1` } : {})
			})
			.where(
				and(
					eq(r.id, reminder.id),
					isNull(r.completedAt),
					consumes ? or(isNull(r.pillsLeft), gt(r.pillsLeft, 0)) : undefined
				)
			)
			.returning({ pillsLeft: r.pillsLeft })
			.all();
		if (!row) {
			// Either already resolved by a concurrent/prior call, or still open with
			// nothing left to dose from. Spawn nothing in both cases.
			const current = tx
				.select({ completedAt: r.completedAt })
				.from(r)
				.where(eq(r.id, reminder.id))
				.get();
			return current && !current.completedAt ? 'noPillsLeft' : null;
		}

		const nextDueAt = computeNextDueAt(reminder);
		if (!nextDueAt)
			return { completedAt, nextReminderId: null, nextDueAt: null, pillsLeft: row.pillsLeft };

		const nextReminderId = generateId(15);
		tx.insert(r)
			.values({
				id: nextReminderId,
				companionId: reminder.companionId,
				title: reminder.title,
				description: reminder.description,
				type: reminder.type,
				dueAt: nextDueAt,
				isRecurring: true,
				recurrenceUnit: reminder.recurrenceUnit,
				recurrenceInterval: reminder.recurrenceInterval,
				recurrenceAnchor: reminder.recurrenceAnchor,
				recurrenceAnchorValue: reminder.recurrenceAnchorValue,
				seriesId: reminder.seriesId ?? reminder.id,
				pillsLeft: row.pillsLeft,
				loggedBy: reminder.loggedBy
			})
			.run();
		return { completedAt, nextReminderId, nextDueAt, pillsLeft: row.pillsLeft };
	});
}

/**
 * Mark a reminder done. A tracked medication reminder burns one pill in the
 * same write; with none left it returns 'noPillsLeft' and the occurrence stays
 * open. Returns null when the occurrence was already resolved (no second dose).
 */
export function completeReminder(
	reminder: Reminder,
	userId: string
): ResolveResult | null | 'noPillsLeft' {
	return resolveReminder(reminder, userId, 'completed');
}

/**
 * Skip the current occurrence of a recurring reminder: resolve it without a
 * "done" record and spawn the next occurrence. One-off reminders can't be
 * skipped — returns null without touching the database. Skipping never
 * touches the pill count.
 */
export function skipReminder(reminder: Reminder, userId: string): ResolveResult | null {
	if (!reminder.isRecurring) return null;
	const result = resolveReminder(reminder, userId, 'skipped');
	return result === 'noPillsLeft' ? null : result;
}

/**
 * Reopen a resolved reminder. A completed dose gives its pill back; a skip
 * had taken none. For a recurring reminder every later occurrence in the
 * series is deleted, so the series rewinds to this one. Returns false when the
 * reminder was not resolved (e.g. a double-submitted restore), touching nothing.
 */
export function restoreReminder(reminder: Reminder): boolean {
	return db.transaction((tx) => restoreIn(tx, reminder));
}

function restoreIn(tx: Tx, reminder: Reminder): boolean {
	const r = schema.reminders;
	// SET expressions read the pre-update row, so `outcome` here is the
	// outcome being cleared.
	const res = tx
		.update(r)
		.set({
			completedAt: null,
			completedBy: null,
			outcome: null,
			pillsLeft: sql`CASE WHEN ${r.outcome} = 'completed' THEN ${r.pillsLeft} + 1 ELSE ${r.pillsLeft} END`
		})
		.where(and(eq(r.id, reminder.id), isNotNull(r.completedAt)))
		.run();
	if (res.changes === 0) return false;

	// Spawned instances carry seriesId = origin.seriesId ?? origin.id, so match
	// on the same fallback: rows whose own seriesId is null still own the
	// instances their id seeded.
	if (reminder.isRecurring) {
		tx.delete(r)
			.where(and(eq(r.seriesId, reminder.seriesId ?? reminder.id), gt(r.dueAt, reminder.dueAt)))
			.run();
	}
	return true;
}

// Rows of one series: spawned occurrences carry seriesId, and an origin whose
// own seriesId is null is matched by its id.
function inSeries(key: string) {
	const r = schema.reminders;
	return or(eq(r.seriesId, key), eq(r.id, key));
}

/**
 * Annotate open reminders with `mistapId`: the completed dose the occurrence
 * follows, which the Mistap button takes back, and `mistapAt`, when that dose
 * was given. Only recurring medication reminders get one, and only when the
 * latest earlier resolved occurrence in the series was a dose (not a skip).
 * Everything else gets nulls.
 */
export async function withMistap<T extends Reminder>(
	rows: T[]
): Promise<(T & { mistapId: string | null; mistapAt: Date | null })[]> {
	const r = schema.reminders;
	const keyOf = (row: Pick<Reminder, 'id' | 'seriesId'>) => row.seriesId ?? row.id;
	const keys = [
		...new Set(
			rows.filter((x) => x.type === 'medication' && x.isRecurring && !x.completedAt).map(keyOf)
		)
	];
	const resolved = keys.length
		? await db
				.select({
					id: r.id,
					seriesId: r.seriesId,
					dueAt: r.dueAt,
					outcome: r.outcome,
					completedAt: r.completedAt
				})
				.from(r)
				.where(and(or(inArray(r.seriesId, keys), inArray(r.id, keys)), isNotNull(r.completedAt)))
				.orderBy(desc(r.dueAt))
		: [];
	return rows.map((row) => {
		if (row.type !== 'medication' || !row.isRecurring || row.completedAt)
			return { ...row, mistapId: null, mistapAt: null };
		const key = keyOf(row);
		// Newest first, so the first earlier match is the occurrence just before.
		const prev = resolved.find((p) => keyOf(p) === key && p.dueAt < row.dueAt);
		return prev?.outcome === 'completed'
			? { ...row, mistapId: prev.id, mistapAt: prev.completedAt }
			: { ...row, mistapId: null, mistapAt: null };
	});
}

/**
 * Mistap: take back the dose that `open` follows. Reopens that occurrence,
 * returns its pill, and deletes `open` (and anything after it), so the series
 * is back where it was before the tap. `doseId` is the dose the button was
 * rendered for; if it's no longer the dose right before an open `open` (a
 * double click, or someone else acted first) nothing is touched and this
 * returns false.
 */
export function mistapDose(open: Reminder, doseId: string): boolean {
	const r = schema.reminders;
	return db.transaction((tx) => {
		const current = tx
			.select({ completedAt: r.completedAt })
			.from(r)
			.where(eq(r.id, open.id))
			.get();
		if (!current || current.completedAt) return false;

		const prev = tx
			.select()
			.from(r)
			.where(
				and(inSeries(open.seriesId ?? open.id), isNotNull(r.completedAt), lt(r.dueAt, open.dueAt))
			)
			.orderBy(desc(r.dueAt))
			.limit(1)
			.get();
		if (!prev || prev.id !== doseId) return false;

		return takeBackIn(tx, prev);
	});
}

/**
 * Take back a dose by its own id (the API's mistap): reopen the occurrence,
 * return its pill, and delete the occurrence the dose spawned. Only the latest
 * resolution in a series can be taken back, so a dose followed by a later
 * dose or skip is refused. Returns the reopened row, or null when there's
 * nothing to take back (not a completed dose, already taken back, or no
 * longer the latest), touching nothing.
 */
export function takeBackDose(doseId: string): Reminder | null {
	const r = schema.reminders;
	return db.transaction((tx) => {
		const dose = tx.select().from(r).where(eq(r.id, doseId)).get();
		if (!dose || !takeBackIn(tx, dose)) return null;
		return tx.select().from(r).where(eq(r.id, doseId)).get() ?? null;
	});
}

// `dose` must be read inside `tx`.
function takeBackIn(tx: Tx, dose: Reminder): boolean {
	const r = schema.reminders;
	if (!dose.completedAt || dose.outcome !== 'completed') return false;
	if (dose.isRecurring) {
		const later = tx
			.select({ id: r.id })
			.from(r)
			.where(
				and(inSeries(dose.seriesId ?? dose.id), isNotNull(r.completedAt), gt(r.dueAt, dose.dueAt))
			)
			.get();
		if (later) return false;
	}
	return restoreIn(tx, dose);
}
