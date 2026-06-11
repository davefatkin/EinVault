import type { Reminder } from '$lib/server/db/schema';
import { unpackMonthDay } from '$lib/reminderRecurrence';
import { computeNextDueAt } from '$lib/server/reminders';

const WEEKDAYS = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'];

// How far forward to materialize RDATE-expanded series (clamped recurrences
// that a plain RRULE would mis-skip). Bounded because RDATEs cannot be infinite.
const RDATE_HORIZON_MS = 3 * 365 * 24 * 60 * 60 * 1000;

function partInZone(d: Date, tz: string, opt: Intl.DateTimeFormatOptions): string {
	return new Intl.DateTimeFormat('en-CA', { timeZone: tz, ...opt }).format(d);
}
function weekdayInTz(d: Date, tz: string): number {
	const wd = partInZone(d, tz, { weekday: 'short' });
	return ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(wd);
}
function monthInTz(d: Date, tz: string): number {
	return Number(partInZone(d, tz, { month: 'numeric' }));
}
function dayInTz(d: Date, tz: string): number {
	return Number(partInZone(d, tz, { day: 'numeric' }));
}

export type Recurrence = { kind: 'rrule'; rrule: string } | { kind: 'rdate'; dates: Date[] };

// Translate a recurring reminder into an RRULE, or an RDATE expansion for the
// day-29..31 / Feb-29 cases where the app clamps but BYMONTHDAY would skip.
// `dtstart` is the absolute instant of the anchor occurrence (its dueAt).
export function reminderRecurrence(r: Reminder, dtstart: Date, tz: string): Recurrence | null {
	if (!r.isRecurring || !r.recurrenceUnit || !r.recurrenceInterval || r.recurrenceInterval < 1) {
		return null;
	}
	const n = r.recurrenceInterval;
	switch (r.recurrenceUnit) {
		case 'day':
			return { kind: 'rrule', rrule: `FREQ=DAILY;INTERVAL=${n}` };
		case 'week':
			return {
				kind: 'rrule',
				rrule: `FREQ=WEEKLY;INTERVAL=${n};BYDAY=${WEEKDAYS[weekdayInTz(dtstart, tz)]}`
			};
		case 'month': {
			const day = r.recurrenceAnchorValue ?? dayInTz(dtstart, tz);
			if (day >= 29) return { kind: 'rdate', dates: expandSeries(r, dtstart) };
			return { kind: 'rrule', rrule: `FREQ=MONTHLY;INTERVAL=${n};BYMONTHDAY=${day}` };
		}
		case 'year': {
			let month: number, day: number;
			if (r.recurrenceAnchorValue) {
				const u = unpackMonthDay(r.recurrenceAnchorValue);
				month = u.monthIdx + 1;
				day = u.day;
			} else {
				month = monthInTz(dtstart, tz);
				day = dayInTz(dtstart, tz);
			}
			if (month === 2 && day === 29) return { kind: 'rdate', dates: expandSeries(r, dtstart) };
			return {
				kind: 'rrule',
				rrule: `FREQ=YEARLY;INTERVAL=${n};BYMONTH=${month};BYMONTHDAY=${day}`
			};
		}
	}
}

// Walk computeNextDueAt from the anchor to reproduce the app's clamped cadence,
// up to a bounded horizon. Includes the anchor itself.
function expandSeries(r: Reminder, dtstart: Date): Date[] {
	const dates: Date[] = [dtstart];
	const horizon = dtstart.getTime() + RDATE_HORIZON_MS;
	let cursor: Reminder = { ...r, dueAt: dtstart };
	for (let i = 0; i < 500; i++) {
		const next = computeNextDueAt(cursor);
		if (!next || next.getTime() > horizon) break;
		dates.push(next);
		cursor = { ...cursor, dueAt: next };
	}
	return dates;
}
