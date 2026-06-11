import { describe, it, expect } from 'vitest';
import ICAL from 'ical.js';
import { buildCalendar } from './calendarIcs';
import type { CalendarItem } from './calendar';

// Validates that buildCalendar output is accepted and correctly interpreted by a
// real iCalendar parser (ical.js — the engine Thunderbird uses), not just that
// it contains the right substrings. This is the closest local proxy to "a real
// calendar client / Home Assistant subscribed to this feed".

const TZ = 'America/New_York';

function parse(ics: string) {
	const comp = new ICAL.Component(ICAL.parse(ics));
	// Register the feed's own VTIMEZONE so TZID times resolve correctly.
	const vtz = comp.getFirstSubcomponent('vtimezone');
	if (vtz) {
		ICAL.TimezoneService.register(new ICAL.Timezone(vtz));
	}
	return comp;
}

function expand(event: ICAL.Event, count: number): ICAL.Time[] {
	const it = event.iterator();
	const out: ICAL.Time[] = [];
	let next: ICAL.Time | null;
	while (out.length < count && (next = it.next())) out.push(next);
	return out;
}

describe('buildCalendar — real-parser validation', () => {
	it('parses as a well-formed VCALENDAR with a usable VTIMEZONE and no METHOD', () => {
		const ics = buildCalendar([], TZ, 'Care shift');
		const comp = parse(ics);
		expect(comp.name).toBe('vcalendar');
		expect(comp.getFirstPropertyValue('version')).toBe('2.0');
		expect(comp.getFirstProperty('method')).toBeNull();
		const vtz = comp.getFirstSubcomponent('vtimezone');
		expect(vtz).not.toBeNull();
		expect(vtz!.getFirstPropertyValue('tzid')).toBe(TZ);
	});

	it('renders an all-day health event the parser reads as a full-day date event', () => {
		const item: CalendarItem = {
			kind: 'health',
			uid: 'health-h1@einvault',
			companionId: 'c1',
			companionName: 'Biscuit',
			title: 'Vet visit',
			start: new Date('2026-06-15T13:00:00Z'),
			allDay: true
		};
		const comp = parse(buildCalendar([item], TZ, 'Care shift'));
		const ev = new ICAL.Event(comp.getFirstSubcomponent('vevent')!);
		expect(ev.summary).toBe('[Biscuit] Vet visit');
		expect(ev.startDate.isDate).toBe(true);
		expect(ev.startDate.toString()).toBe('2026-06-15');
		// All-day end is the next day (exclusive), per the explicit DTEND.
		expect(ev.endDate.toString()).toBe('2026-06-16');
	});

	it('keeps a recurring reminder at 09:00 local across the autumn DST change', () => {
		// 13:00Z on 2026-06-15 is 09:00 in New York (EDT). Monthly on the 15th.
		const item: CalendarItem = {
			kind: 'reminder',
			uid: 'reminder-series-s1@einvault',
			companionId: 'c1',
			companionName: 'Biscuit',
			title: 'Heartworm pill',
			start: new Date('2026-06-15T13:00:00Z'),
			allDay: false,
			recurrence: { kind: 'rrule', rrule: 'FREQ=MONTHLY;INTERVAL=1;BYMONTHDAY=15' }
		};
		const comp = parse(buildCalendar([item], TZ, 'Care shift'));
		const ev = new ICAL.Event(comp.getFirstSubcomponent('vevent')!);
		expect(ev.isRecurring()).toBe(true);

		const occ = expand(ev, 6); // Jun..Nov 15
		// Wall-clock holds at 09:00 on the 15th every month, including after the
		// Nov 1 2026 DST transition.
		for (const t of occ) {
			expect(t.day).toBe(15);
			expect(t.hour).toBe(9);
			expect(t.minute).toBe(0);
		}
		// And the absolute instants shift by an hour across DST: Oct 15 is EDT
		// (13:00Z), Nov 15 is EST (14:00Z). This is exactly what a UTC-only feed
		// would have gotten wrong.
		const oct = occ.find((t) => t.month === 10)!;
		const nov = occ.find((t) => t.month === 11)!;
		expect(oct.toJSDate().toISOString()).toBe('2026-10-15T13:00:00.000Z');
		expect(nov.toJSDate().toISOString()).toBe('2026-11-15T14:00:00.000Z');
	});

	it('materializes a clamped series as standalone events at the right instants', () => {
		// The day-31 series the app would clamp: Jan 31, Feb 28, Mar 31 at 09:00 local.
		const dates = [
			new Date('2026-01-31T14:00:00Z'), // 09:00 EST
			new Date('2026-02-28T14:00:00Z'), // 09:00 EST
			new Date('2026-03-31T13:00:00Z') // 09:00 EDT (after Mar 8 DST)
		];
		const item: CalendarItem = {
			kind: 'reminder',
			uid: 'reminder-series-s2@einvault',
			companionId: 'c1',
			companionName: 'Biscuit',
			title: 'Monthly dose',
			start: dates[0],
			allDay: false,
			recurrence: { kind: 'rdate', dates }
		};
		const comp = parse(buildCalendar([item], TZ, 'Care shift'));
		const events = comp.getAllSubcomponents('vevent').map((c) => new ICAL.Event(c));
		// One standalone VEVENT per occurrence, distinct UIDs, none recurring.
		expect(events).toHaveLength(3);
		expect(events.map((e) => e.uid)).toEqual([
			'reminder-series-s2-0@einvault',
			'reminder-series-s2-1@einvault',
			'reminder-series-s2-2@einvault'
		]);
		expect(events.some((e) => e.isRecurring())).toBe(false);
		// Correct absolute instants and 09:00 local wall-clock for each.
		expect(events.map((e) => e.startDate.toJSDate().toISOString())).toEqual([
			'2026-01-31T14:00:00.000Z',
			'2026-02-28T14:00:00.000Z',
			'2026-03-31T13:00:00.000Z'
		]);
		for (const e of events) expect(e.startDate.hour).toBe(9);
	});

	it('round-trips special characters and long lines without corruption', () => {
		const item: CalendarItem = {
			kind: 'reminder',
			uid: 'reminder-r9@einvault',
			companionId: 'c1',
			companionName: 'Rex, Jr',
			title: 'Give the very long-named medication '.repeat(4).trim(),
			start: new Date('2026-06-15T13:00:00Z'),
			allDay: false
		};
		const comp = parse(buildCalendar([item], TZ, 'Care shift'));
		const ev = new ICAL.Event(comp.getFirstSubcomponent('vevent')!);
		// Comma in the companion name survives folding + escaping intact.
		expect(ev.summary).toBe(`[Rex, Jr] ${item.title}`);
		// CATEGORIES keeps two distinct values (kind + companion), comma-delimited.
		const cats = ev.component.getFirstProperty('categories')!.getValues();
		expect(cats).toContain('reminder');
		expect(cats).toContain('Rex, Jr');
	});

	it('labels caretaker shifts and resolves their TZID start/end', () => {
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
		const comp = parse(buildCalendar([item], TZ, 'Care shift'));
		const ev = new ICAL.Event(comp.getFirstSubcomponent('vevent')!);
		expect(ev.summary).toBe('Care shift');
		expect(ev.startDate.hour).toBe(9); // 13:00Z -> 09:00 EDT
		expect(ev.endDate.hour).toBe(17); // 21:00Z -> 17:00 EDT
	});
});
