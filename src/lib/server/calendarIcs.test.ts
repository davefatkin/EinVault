import { describe, it, expect } from 'vitest';
import { buildCalendar } from './calendarIcs';
import type { CalendarItem } from './calendar';

const TZ = 'America/New_York';
const shiftLabel = 'Care shift';

describe('buildCalendar', () => {
	it('emits a valid VCALENDAR without METHOD and with one VTIMEZONE', () => {
		const ics = buildCalendar([], TZ, shiftLabel);
		expect(ics).toContain('BEGIN:VCALENDAR');
		expect(ics).toContain('VERSION:2.0');
		expect(ics).toContain('BEGIN:VTIMEZONE');
		expect(ics).not.toContain('METHOD:');
		expect(ics.trimEnd().endsWith('END:VCALENDAR')).toBe(true);
	});

	it('renders an all-day health event with next-day DTEND', () => {
		const item: CalendarItem = {
			kind: 'health',
			uid: 'health-h1@einvault',
			companionId: 'c1',
			companionName: 'Biscuit',
			title: 'Vet visit',
			start: new Date('2026-06-15T13:00:00Z'),
			allDay: true
		};
		const ics = buildCalendar([item], TZ, shiftLabel);
		expect(ics).toContain('DTSTART;VALUE=DATE:20260615');
		expect(ics).toContain('DTEND;VALUE=DATE:20260616');
		expect(ics).toContain('SUMMARY:[Biscuit] Vet visit');
		expect(ics).toContain('CATEGORIES:health,Biscuit');
	});

	it('renders a recurring reminder with TZID and RRULE', () => {
		const item: CalendarItem = {
			kind: 'reminder',
			uid: 'reminder-series-s1@einvault',
			companionId: 'c1',
			companionName: 'Biscuit',
			title: 'Pill',
			start: new Date('2026-06-15T13:00:00Z'),
			allDay: false,
			recurrence: { kind: 'rrule', rrule: 'FREQ=MONTHLY;INTERVAL=1;BYMONTHDAY=15' }
		};
		const ics = buildCalendar([item], TZ, shiftLabel);
		expect(ics).toContain('DTSTART;TZID=America/New_York:20260615T090000');
		expect(ics).toContain('RRULE:FREQ=MONTHLY;INTERVAL=1;BYMONTHDAY=15');
	});

	it('expands a clamped (rdate) series into one standalone VEVENT per occurrence', () => {
		const item: CalendarItem = {
			kind: 'reminder',
			uid: 'reminder-series-s2@einvault',
			companionId: 'c1',
			companionName: 'Biscuit',
			title: 'Dose',
			start: new Date('2026-01-31T14:00:00Z'),
			allDay: false,
			recurrence: {
				kind: 'rdate',
				dates: [
					new Date('2026-01-31T14:00:00Z'), // 09:00 EST
					new Date('2026-02-28T14:00:00Z'), // 09:00 EST
					new Date('2026-03-31T13:00:00Z') // 09:00 EDT (after Mar 8 DST)
				]
			}
		};
		const ics = buildCalendar([item], TZ, shiftLabel);
		// No RDATE/RRULE: each occurrence is its own VEVENT with a distinct, stable UID.
		expect(ics).not.toContain('RDATE');
		expect((ics.match(/BEGIN:VEVENT/g) ?? []).length).toBe(3);
		expect(ics).toContain('UID:reminder-series-s2-0@einvault');
		expect(ics).toContain('UID:reminder-series-s2-1@einvault');
		expect(ics).toContain('UID:reminder-series-s2-2@einvault');
		expect(ics).toContain('DTSTART;TZID=America/New_York:20260131T090000');
		expect(ics).toContain('DTSTART;TZID=America/New_York:20260228T090000');
		expect(ics).toContain('DTSTART;TZID=America/New_York:20260331T090000');
	});

	it('escapes commas in companion name in CATEGORIES and SUMMARY', () => {
		const item: CalendarItem = {
			kind: 'health',
			uid: 'health-h2@einvault',
			companionId: 'c2',
			companionName: 'Rex, Jr',
			title: 'Checkup',
			start: new Date('2026-06-15T13:00:00Z'),
			allDay: true
		};
		const ics = buildCalendar([item], TZ, shiftLabel);
		expect(ics).toContain('CATEGORIES:health,Rex\\, Jr');
		expect(ics).toContain('SUMMARY:[Rex\\, Jr] Checkup');
	});

	it('keeps VTIMEZONE lines intact after folding (not space-continued blobs)', () => {
		const lines = buildCalendar([], TZ, shiftLabel).split('\r\n');
		expect(lines.includes('BEGIN:VTIMEZONE')).toBe(true);
		expect(lines.includes('END:VTIMEZONE')).toBe(true);
	});

	it('uses the shift label for shift summaries', () => {
		const item: CalendarItem = {
			kind: 'shift',
			uid: 'shift-s1@einvault',
			companionId: null,
			companionName: null,
			title: '',
			start: new Date('2026-06-15T13:00:00Z'),
			end: new Date('2026-06-15T21:00:00Z'),
			allDay: false
		};
		const ics = buildCalendar([item], TZ, shiftLabel);
		expect(ics).toContain('SUMMARY:Care shift');
	});
});
