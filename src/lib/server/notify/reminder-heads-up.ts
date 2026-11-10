// Reminder heads-ups (issue #406): advance notifications N local calendar
// days before a reminder is due. Pure row building; the scheduler loads the
// reminders and recipients and does delivery.
import { leadTime, parseLeadDays } from '#lib/reminderLeadTimes.js';
import { CATCH_UP_MS, reminderUpcomingDedupeKey, type EnqueueRow, type Recipient } from './outbox';

export interface HeadsUpTiming {
	dueAt: Date;
	notifyLeadDays: string | null;
	leadArmedAt: Date | null;
	createdAt: Date;
}

export interface HeadsUpReminder extends HeadsUpTiming {
	id: string;
	companionId: string;
}

/**
 * The shortest lead whose time has come, or null. A lead is eligible when its
 * time has passed, is no older than CATCH_UP_MS, and is not before the moment
 * the current settings were armed (so saving or spawning an occurrence never
 * fires a lead that already passed). Nothing once the reminder is due. Longer
 * leads eligible in the same scan are dropped, not queued.
 */
export function pickHeadsUp(reminder: HeadsUpTiming, now: Date): number | null {
	if (now >= reminder.dueAt) return null;
	const armedAt = (reminder.leadArmedAt ?? reminder.createdAt).getTime();
	const nowMs = now.getTime();
	const ascending = parseLeadDays(reminder.notifyLeadDays).reverse();
	for (const days of ascending) {
		const at = leadTime(reminder.dueAt, days).getTime();
		if (at <= nowMs && at > nowMs - CATCH_UP_MS && at >= armedAt) return days;
	}
	return null;
}

/**
 * One row per reminder with an eligible lead per recipient per channel.
 * Recipient rules match the due notification: caretakers only for assigned
 * companions (shift ignored), email with mail on plus opt-in and address,
 * ntfy with ntfy on plus a topic.
 */
export function buildReminderHeadsUpRows(
	reminders: HeadsUpReminder[],
	recipients: Recipient[],
	assigned: Set<string>,
	now: Date,
	opts: { mailOn: boolean; ntfyOn: boolean }
): EnqueueRow[] {
	const rows: EnqueueRow[] = [];
	for (const reminder of reminders) {
		const leadDays = pickHeadsUp(reminder, now);
		if (leadDays === null) continue;
		const payload = {
			kind: 'reminderUpcoming' as const,
			reminderId: reminder.id,
			dueAtEpoch: Math.floor(reminder.dueAt.getTime() / 1000),
			leadDays
		};
		for (const user of recipients) {
			if (user.role === 'caretaker' && !assigned.has(`${reminder.companionId}:${user.id}`)) {
				continue;
			}
			if (opts.mailOn && user.flag && user.email) {
				rows.push({
					dedupeKey: reminderUpcomingDedupeKey(
						reminder.id,
						reminder.dueAt,
						leadDays,
						user.id,
						'email'
					),
					userId: user.id,
					channel: 'email',
					payload
				});
			}
			if (opts.ntfyOn && user.ntfyTopic) {
				rows.push({
					dedupeKey: reminderUpcomingDedupeKey(
						reminder.id,
						reminder.dueAt,
						leadDays,
						user.id,
						'ntfy'
					),
					userId: user.id,
					channel: 'ntfy',
					payload
				});
			}
		}
	}
	return rows;
}
