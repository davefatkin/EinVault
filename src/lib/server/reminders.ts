import { db, schema } from '#lib/server/db/index.js';
import { and, eq, isNull } from 'drizzle-orm';
import { generateId } from '#lib/server/utils.js';
import { localDateISO } from '#lib/date.js';
import { isMedicationActive } from '#lib/medications.js';
import { applyDoseStock } from '#lib/server/supplies.js';
import {
	clampDayOfMonth,
	unpackMonthDay,
	type RecurrenceUnit,
	type RecurrenceAnchor
} from '#lib/reminderRecurrence.js';

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

export type ResolveResult = {
	completedAt: Date;
	nextReminderId: string | null;
	/** The dose written for a completed medication-linked occurrence, else null. */
	doseId: string | null;
};

/** Dose details when completing a medication-linked occurrence. */
export type DoseOptions = { givenAt?: Date; note?: string | null };

function resolveReminder(
	reminder: Reminder,
	userId: string,
	outcome: 'completed' | 'skipped',
	dose: DoseOptions = {}
): ResolveResult | null {
	const completedAt = new Date();
	let nextReminderId: string | null = null;
	let doseId: string | null = null;
	let resolved = false;
	db.transaction((tx) => {
		const res = tx
			.update(schema.reminders)
			.set({ completedAt, completedBy: userId, outcome })
			.where(and(eq(schema.reminders.id, reminder.id), isNull(schema.reminders.completedAt)))
			.run();
		if (res.changes === 0) return; // already resolved by a concurrent/prior call — spawn nothing
		resolved = true;

		// Read the medication fresh: the snapshot's link may point at a deleted one.
		const medication = reminder.medicationId
			? tx
					.select({ id: schema.medications.id, endedOn: schema.medications.endedOn })
					.from(schema.medications)
					.where(eq(schema.medications.id, reminder.medicationId))
					.get()
			: undefined;

		// An ended medication (as of the completion's local date) takes no dose
		// and keeps no open reminder (R1); the completion itself still stands.
		const medicationActive =
			!!medication && isMedicationActive(medication.endedOn, localDateISO(completedAt));

		if (medication && medicationActive && outcome === 'completed') {
			const id = generateId(15);
			const givenAt = dose.givenAt ?? completedAt;
			tx.insert(schema.medicationDoses)
				.values({
					id,
					medicationId: medication.id,
					givenAt,
					givenBy: userId,
					reminderId: reminder.id,
					source: 'reminder',
					note: dose.note ?? null
				})
				.run();
			applyDoseStock(tx, { id, medicationId: medication.id, givenAt, givenBy: userId });
			doseId = id;
		}

		const nextDueAt = computeNextDueAt(reminder);
		if (!nextDueAt) return;
		if (medication && !medicationActive) return;
		// A course stops by itself: nothing spawns past the medication's last day.
		if (medication?.endedOn && localDateISO(nextDueAt) > medication.endedOn) return;

		nextReminderId = generateId(15);
		tx.insert(schema.reminders)
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
				notifyLeadDays: reminder.notifyLeadDays,
				leadArmedAt: reminder.notifyLeadDays ? new Date() : null,
				medicationId: medication?.id ?? null,
				loggedBy: reminder.loggedBy
			})
			.run();
	});
	return resolved ? { completedAt, nextReminderId, doseId } : null;
}

/**
 * Complete an occurrence and spawn the next one. A medication-linked
 * occurrence also logs one dose (given now unless `dose.givenAt` says
 * otherwise) in the same transaction.
 */
export function completeReminder(
	reminder: Reminder,
	userId: string,
	dose?: DoseOptions
): ResolveResult | null {
	return resolveReminder(reminder, userId, 'completed', dose);
}

/**
 * Skip the current occurrence of a recurring reminder: resolve it without a
 * "done" record and spawn the next occurrence. One-off reminders can't be
 * skipped — returns null without touching the database.
 */
export function skipReminder(reminder: Reminder, userId: string): ResolveResult | null {
	if (!reminder.isRecurring) return null;
	return resolveReminder(reminder, userId, 'skipped');
}
