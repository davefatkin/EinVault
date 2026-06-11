import type { RequestHandler } from './$types';
import { env } from '$env/dynamic/private';
import { t } from '$lib/i18n';
import { CALENDAR_FEED_ENABLED, CALENDAR_FEED_HISTORY_DAYS } from '$lib/server/env';
import { userByFeedToken } from '$lib/server/calendarToken';
import { getCalendarItems, type CalendarKind } from '$lib/server/calendar';
import { buildCalendar } from '$lib/server/calendarIcs';

const KNOWN_KINDS: CalendarKind[] = ['health', 'reminder', 'shift'];

function notFound(): Response {
	return new Response('Not found', { status: 404 });
}

export const GET: RequestHandler = async ({ params, url, locals }) => {
	if (!CALENDAR_FEED_ENABLED) return notFound();

	const user = await userByFeedToken(params.token);
	if (!user) return notFound();

	const types = (url.searchParams.get('type') ?? '')
		.split(',')
		.map((s) => s.trim())
		.filter((s): s is CalendarKind => (KNOWN_KINDS as string[]).includes(s));
	const companionIds = url.searchParams
		.getAll('companion')
		.flatMap((v) => v.split(','))
		.map((s) => s.trim())
		.filter(Boolean);

	const tz = env.TZ?.trim() || 'UTC';
	const shiftLabel = t(locals.locale, 'layout.caretaker.shiftCalendarEvent');

	let body: string;
	try {
		const items = await getCalendarItems(
			{ id: user.id, role: user.role },
			{ types, companionIds, historyDays: CALENDAR_FEED_HISTORY_DAYS, now: new Date() }
		);
		body = buildCalendar(items, tz, shiftLabel);
	} catch {
		body = buildCalendar([], tz, shiftLabel);
	}

	return new Response(body, {
		headers: {
			'Content-Type': 'text/calendar; charset=utf-8',
			'Cache-Control': 'private, max-age=300'
		}
	});
};
