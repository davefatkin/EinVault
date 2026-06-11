import {
	icsDate,
	icsEscape,
	icsLocal,
	icsDateOnly,
	foldLine,
	vtimezoneBlock
} from '$lib/server/ics';
import type { CalendarItem } from '$lib/server/calendar';

export function buildCalendar(items: CalendarItem[], tz: string, shiftLabel: string): string {
	const tzBlock = vtimezoneBlock(tz);
	const useTzid = tzBlock !== null;

	const lines: string[] = [
		'BEGIN:VCALENDAR',
		'VERSION:2.0',
		'PRODID:-//EinVault//Calendar//EN',
		'CALSCALE:GREGORIAN'
	];

	if (tzBlock) {
		lines.push(...tzBlock.split(/\r?\n/).filter(Boolean));
	}

	for (const item of items) {
		lines.push('BEGIN:VEVENT');
		lines.push(`UID:${item.uid}`);
		lines.push(`DTSTAMP:${icsDate(new Date())}`);

		if (item.allDay) {
			lines.push(`DTSTART;VALUE=DATE:${icsDateOnly(item.start, tz)}`);
			const nextDay = new Date(item.start.getTime() + 24 * 60 * 60 * 1000);
			lines.push(`DTEND;VALUE=DATE:${icsDateOnly(nextDay, tz)}`);
		} else {
			if (useTzid) {
				lines.push(`DTSTART;TZID=${tz}:${icsLocal(item.start, tz)}`);
				if (item.end) {
					lines.push(`DTEND;TZID=${tz}:${icsLocal(item.end, tz)}`);
				}
			} else {
				lines.push(`DTSTART:${icsLocal(item.start, tz)}`);
				if (item.end) {
					lines.push(`DTEND:${icsLocal(item.end, tz)}`);
				}
			}
		}

		if (item.recurrence) {
			if (item.recurrence.kind === 'rrule') {
				lines.push(`RRULE:${item.recurrence.rrule}`);
			} else {
				// rdate: first date is DTSTART; emit RDATE for the rest
				const [, ...rest] = item.recurrence.dates;
				for (const d of rest) {
					if (useTzid) {
						lines.push(`RDATE;TZID=${tz}:${icsLocal(d, tz)}`);
					} else {
						lines.push(`RDATE:${icsLocal(d, tz)}`);
					}
				}
			}
		}

		let summary: string;
		if (item.kind === 'shift') {
			summary = icsEscape(shiftLabel);
		} else if (item.companionName) {
			summary = icsEscape(`[${item.companionName}] ${item.title}`);
		} else {
			summary = icsEscape(item.title);
		}
		lines.push(`SUMMARY:${summary}`);

		// CATEGORIES: comma is the RFC5545 multi-value delimiter (not escaped);
		// each value must be individually escaped
		const cats = item.companionName
			? `${item.kind},${icsEscape(item.companionName)}`
			: item.kind;
		lines.push(`CATEGORIES:${cats}`);

		lines.push('END:VEVENT');
	}

	lines.push('END:VCALENDAR');

	return lines.map(foldLine).join('\r\n') + '\r\n';
}
