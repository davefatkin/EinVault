import type { Locale } from '#lib/i18n/index.js';

/** Returns today's date as YYYY-MM-DD in the local (device/server) timezone. */
export function localDateISO(d: Date = new Date()): string {
	const p = (n: number) => String(n).padStart(2, '0');
	return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** Value for a datetime-local input (`YYYY-MM-DDTHH:mm`) in the runtime's zone. */
export function localDatetimeValue(d: Date = new Date()): string {
	const p = (n: number) => String(n).padStart(2, '0');
	return `${localDateISO(d)}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

/** Strict `YYYY-MM-DD` parse; null unless it is a real calendar date. */
export function parseYmd(s: string | null | undefined): { y: number; m: number; d: number } | null {
	const match = s ? /^(\d{4})-(\d{2})-(\d{2})$/.exec(s) : null;
	if (!match) return null;
	const y = Number(match[1]);
	const m = Number(match[2]);
	const d = Number(match[3]);
	if (m < 1 || m > 12 || d < 1 || d > daysInMonth(y, m)) return null;
	return { y, m, d };
}

/** Days in a month; m is 1-12. */
export function daysInMonth(y: number, m: number): number {
	return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

/**
 * Formats a date-only `YYYY-MM-DD` string as a calendar day: noon UTC rendered
 * in UTC, so the day never shifts with the runtime or household time zone.
 */
export function formatYmd(
	ymd: string,
	locale: Locale,
	opts: Intl.DateTimeFormatOptions
): string | null {
	const p = parseYmd(ymd);
	if (!p) return null;
	return new Intl.DateTimeFormat(locale, { ...opts, timeZone: 'UTC' }).format(
		Date.UTC(p.y, p.m - 1, p.d, 12)
	);
}

/** Formats a date-only string without any time zone shift. */
export function formatDateOnly(ymd: string, locale: Locale): string | null {
	return formatYmd(ymd, locale, { dateStyle: 'medium' });
}

/** Adds calendar days to a `YYYY-MM-DD` date. Pure date math, so DST never shifts the result. */
export function addDaysYmd(ymd: string, days: number): string {
	const p = parseYmd(ymd);
	if (!p) throw new Error(`Invalid date: ${ymd}`);
	const d = new Date(Date.UTC(p.y, p.m - 1, p.d + days));
	const pad = (n: number) => String(n).padStart(2, '0');
	return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}

/** Calendar days from `from` to `to` (negative when `to` is earlier). */
export function daysBetweenYmd(from: string, to: string): number {
	const a = parseYmd(from);
	const b = parseYmd(to);
	if (!a || !b) throw new Error(`Invalid date: ${from} / ${to}`);
	return Math.round((Date.UTC(b.y, b.m - 1, b.d) - Date.UTC(a.y, a.m - 1, a.d)) / 86_400_000);
}
