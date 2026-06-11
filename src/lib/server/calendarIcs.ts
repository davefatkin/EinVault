import {
	icsDate,
	icsEscape,
	icsLocal,
	icsDateOnly,
	foldLine,
	vtimezoneBlock
} from '$lib/server/ics';
import type { CalendarItem } from '$lib/server/calendar';

interface EventFields {
	uid: string;
	start: Date;
	end?: Date;
	allDay: boolean;
	rrule?: string;
	summary: string;
	categories: string;
}

function pushEvent(lines: string[], ev: EventFields, tz: string, useTzid: boolean): void {
	lines.push('BEGIN:VEVENT');
	lines.push(`UID:${ev.uid}`);
	lines.push(`DTSTAMP:${icsDate(new Date())}`);

	if (ev.allDay) {
		lines.push(`DTSTART;VALUE=DATE:${icsDateOnly(ev.start, tz)}`);
		const nextDay = new Date(ev.start.getTime() + 24 * 60 * 60 * 1000);
		lines.push(`DTEND;VALUE=DATE:${icsDateOnly(nextDay, tz)}`);
	} else if (useTzid) {
		lines.push(`DTSTART;TZID=${tz}:${icsLocal(ev.start, tz)}`);
		if (ev.end) lines.push(`DTEND;TZID=${tz}:${icsLocal(ev.end, tz)}`);
	} else {
		lines.push(`DTSTART:${icsLocal(ev.start, tz)}`);
		if (ev.end) lines.push(`DTEND:${icsLocal(ev.end, tz)}`);
	}

	if (ev.rrule) lines.push(`RRULE:${ev.rrule}`);

	lines.push(`SUMMARY:${ev.summary}`);
	lines.push(`CATEGORIES:${ev.categories}`);
	lines.push('END:VEVENT');
}

// Distinct, stable UID for occurrence i of a materialized series (RDATE path).
// Same dates -> same indices -> same UIDs across polls.
function occurrenceUid(uid: string, i: number): string {
	const at = uid.indexOf('@');
	return at === -1 ? `${uid}-${i}` : `${uid.slice(0, at)}-${i}${uid.slice(at)}`;
}

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
		let summary: string;
		if (item.kind === 'shift') {
			summary = icsEscape(shiftLabel);
		} else if (item.companionName) {
			summary = icsEscape(`[${item.companionName}] ${item.title}`);
		} else {
			summary = icsEscape(item.title);
		}

		// CATEGORIES: comma is the RFC5545 multi-value delimiter (not escaped);
		// each value must be individually escaped.
		const categories = item.companionName
			? `${item.kind},${icsEscape(item.companionName)}`
			: item.kind;

		if (item.recurrence?.kind === 'rdate') {
			// Clamped recurrences (e.g. monthly on the 31st) cannot be expressed as a
			// plain RRULE without skipping months. Rather than rely on RDATE — whose
			// DTSTART-occurrence handling varies between calendar clients — emit one
			// standalone VEVENT per occurrence so every client renders all of them.
			item.recurrence.dates.forEach((d, i) => {
				pushEvent(
					lines,
					{ uid: occurrenceUid(item.uid, i), start: d, allDay: false, summary, categories },
					tz,
					useTzid
				);
			});
			continue;
		}

		pushEvent(
			lines,
			{
				uid: item.uid,
				start: item.start,
				end: item.end,
				allDay: item.allDay,
				rrule: item.recurrence?.kind === 'rrule' ? item.recurrence.rrule : undefined,
				summary,
				categories
			},
			tz,
			useTzid
		);
	}

	lines.push('END:VCALENDAR');

	return lines.map(foldLine).join('\r\n') + '\r\n';
}
