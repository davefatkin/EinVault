import { formatYmd } from '#lib/date.js';
import { t, type Locale } from '#lib/i18n/index.js';

/** Ignored for date-only `YYYY-MM-DD` input, which always renders as a date. */
export type LocalTimeFormat = 'date' | 'datetime' | 'time' | 'relative';
export type LocalTimeInput = Date | string | number | null | undefined;

const DATE_OPTS: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric', year: 'numeric' };

export interface LocalTimeOptions {
	format?: LocalTimeFormat;
	locale: Locale;
	/** Household (server) time zone. Undefined uses the runtime zone. */
	timeZone?: string;
	now?: number;
}

/**
 * Formats a value for `<LocalTime>`. Date-only `YYYY-MM-DD` strings are
 * calendar days, so they skip time zone conversion entirely. Everything else
 * is an instant, shown in the household time zone with the app locale.
 */
export function formatLocalTime(
	raw: LocalTimeInput,
	{ format = 'date', locale, timeZone, now = Date.now() }: LocalTimeOptions
): { display: string; datetime: string } | null {
	if (!raw) return null;

	if (typeof raw === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(raw)) {
		const display = formatYmd(raw, locale, DATE_OPTS);
		return display ? { display, datetime: raw } : null;
	}

	const d = raw instanceof Date ? raw : new Date(raw);
	if (isNaN(d.getTime())) return null;

	const tz = timeZone ? { timeZone } : {};
	let display: string;
	if (format === 'time') {
		display = d.toLocaleTimeString(locale, { hour: 'numeric', minute: '2-digit', ...tz });
	} else if (format === 'datetime') {
		display = d.toLocaleString(locale, {
			month: 'short',
			day: 'numeric',
			year: 'numeric',
			hour: 'numeric',
			minute: '2-digit',
			...tz
		});
	} else if (format === 'relative') {
		const diff = now - d.getTime();
		const mins = Math.floor(diff / 60000);
		const hours = Math.floor(diff / 3600000);
		const days = Math.floor(diff / 86400000);
		if (mins < 1) display = t(locale, 'time.justNow');
		else if (mins < 60) display = t(locale, 'time.minutesAgo', { count: mins });
		else if (hours < 24) display = t(locale, 'time.hoursAgo', { count: hours });
		else if (days < 7) display = t(locale, 'time.daysAgo', { count: days });
		else display = d.toLocaleDateString(locale, { month: 'short', day: 'numeric', ...tz });
	} else {
		display = d.toLocaleDateString(locale, { ...DATE_OPTS, ...tz });
	}
	return { display, datetime: d.toISOString() };
}
