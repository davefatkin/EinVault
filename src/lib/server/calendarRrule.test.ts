import { describe, it, expect } from 'vitest';
import { reminderRecurrence } from './calendarRrule';
import type { Reminder } from '$lib/server/db/schema';

const TZ = 'America/New_York';
function rem(partial: Partial<Reminder>): Reminder {
	return {
		id: 'r1', companionId: 'c1', title: 't', description: null, type: 'medication',
		dueAt: new Date('2026-06-15T13:00:00Z'), isRecurring: true,
		recurrenceUnit: null, recurrenceInterval: null, recurrenceAnchor: 'interval',
		recurrenceAnchorValue: null, seriesId: 's1', completedAt: null, completedBy: null,
		createdAt: new Date(), loggedBy: null, ...partial
	} as Reminder;
}

describe('reminderRecurrence', () => {
	it('non-recurring → null', () => {
		expect(reminderRecurrence(rem({ isRecurring: false }), new Date(), TZ)).toBeNull();
	});
	it('daily', () => {
		expect(reminderRecurrence(rem({ recurrenceUnit: 'day', recurrenceInterval: 2 }), new Date('2026-06-15T13:00:00Z'), TZ))
			.toEqual({ kind: 'rrule', rrule: 'FREQ=DAILY;INTERVAL=2' });
	});
	it('weekly pins BYDAY from the DTSTART weekday in tz', () => {
		// 2026-06-15T13:00Z is a Monday in New York
		expect(reminderRecurrence(rem({ recurrenceUnit: 'week', recurrenceInterval: 1 }), new Date('2026-06-15T13:00:00Z'), TZ))
			.toEqual({ kind: 'rrule', rrule: 'FREQ=WEEKLY;INTERVAL=1;BYDAY=MO' });
	});
	it('monthly with anchor day < 29 → BYMONTHDAY', () => {
		expect(reminderRecurrence(rem({ recurrenceUnit: 'month', recurrenceInterval: 1, recurrenceAnchorValue: 15 }), new Date('2026-06-15T13:00:00Z'), TZ))
			.toEqual({ kind: 'rrule', rrule: 'FREQ=MONTHLY;INTERVAL=1;BYMONTHDAY=15' });
	});
	it('monthly with anchor day >= 29 → RDATE expansion (clamped cadence)', () => {
		const r = reminderRecurrence(rem({ recurrenceUnit: 'month', recurrenceInterval: 1, recurrenceAnchorValue: 31 }), new Date('2026-01-31T12:00:00Z'), TZ);
		expect(r?.kind).toBe('rdate');
		expect((r as { kind: 'rdate'; dates: Date[] }).dates.length).toBeGreaterThan(2);
	});
	it('yearly packs BYMONTH/BYMONTHDAY', () => {
		// packMonthDay(5,20) = (5+1)*100+20 = 620 → June 20
		expect(reminderRecurrence(rem({ recurrenceUnit: 'year', recurrenceInterval: 1, recurrenceAnchorValue: 620 }), new Date('2026-06-20T12:00:00Z'), TZ))
			.toEqual({ kind: 'rrule', rrule: 'FREQ=YEARLY;INTERVAL=1;BYMONTH=6;BYMONTHDAY=20' });
	});
});
