import { redirect, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { t } from '$lib/i18n';
import { getUpcomingShifts } from '$lib/server/shifts';

function icsDate(d: Date): string {
	return d
		.toISOString()
		.replace(/[-:]/g, '')
		.replace(/\.\d{3}/, '');
}

function icsEscape(s: string): string {
	return s.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n');
}

export const GET: RequestHandler = async ({ locals }) => {
	if (!locals.user) redirect(302, '/auth/login');
	if (locals.user.role !== 'caretaker') error(403, t(locals.locale, 'error.forbidden'));

	const shifts = await getUpcomingShifts(locals.user.id);

	const lines: string[] = [
		'BEGIN:VCALENDAR',
		'VERSION:2.0',
		'PRODID:-//EinVault//Shifts//EN',
		'CALSCALE:GREGORIAN',
		'METHOD:PUBLISH'
	];

	for (const shift of shifts) {
		lines.push('BEGIN:VEVENT');
		lines.push(`UID:shift-${shift.id}@einvault`);
		lines.push(`DTSTAMP:${icsDate(new Date())}`);
		lines.push(`DTSTART:${icsDate(shift.startAt)}`);
		lines.push(`DTEND:${icsDate(shift.endAt)}`);
		lines.push(`SUMMARY:${icsEscape(t(locals.locale, 'layout.caretaker.shiftCalendarEvent'))}`);
		if (shift.notes) lines.push(`DESCRIPTION:${icsEscape(shift.notes)}`);
		lines.push('END:VEVENT');
	}

	lines.push('END:VCALENDAR');

	return new Response(lines.join('\r\n'), {
		headers: {
			'Content-Type': 'text/calendar; charset=utf-8',
			'Content-Disposition': 'attachment; filename="einvault-shifts.ics"'
		}
	});
};
