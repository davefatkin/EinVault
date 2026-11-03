import type { Locale } from '#lib/i18n/index.js';

/** Returns today's date as YYYY-MM-DD in the local (device/server) timezone. */
export function localDateISO(d: Date = new Date()): string {
	const p = (n: number) => String(n).padStart(2, '0');
	return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
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

/** Formats a date-only string without any time zone shift. */
export function formatDateOnly(ymd: string, locale: Locale): string | null {
	const p = parseYmd(ymd);
	if (!p) return null;
	return new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeZone: 'UTC' }).format(
		Date.UTC(p.y, p.m - 1, p.d, 12)
	);
}
