import { db, schema } from '$lib/server/db';
import { eq } from 'drizzle-orm';
import { generateId } from '$lib/server/utils';
import {
	clampDayOfMonth,
	unpackMonthDay,
	type RecurrenceUnit,
	type RecurrenceAnchor
} from '$lib/reminderRecurrence';

type Reminder = typeof schema.reminders.$inferSelect;

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

export function completeReminder(reminder: Reminder, userId: string): void {
	db.transaction((tx) => {
		tx.update(schema.reminders)
			.set({ completedAt: new Date(), completedBy: userId })
			.where(eq(schema.reminders.id, reminder.id))
			.run();

		const nextDueAt = computeNextDueAt(reminder);
		if (!nextDueAt) return;

		tx.insert(schema.reminders)
			.values({
				id: generateId(15),
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
				loggedBy: reminder.loggedBy
			})
			.run();
	});
}
