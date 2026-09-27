import type { Locale } from '$lib/i18n';
import type { Mood } from '$lib/mood';

export type { Mood } from '$lib/mood';

export const MOOD_TREND_RANGES = [7, 30, 90] as const;
export type MoodTrendRange = (typeof MOOD_TREND_RANGES)[number];
export const MOOD_TREND_DEFAULT: MoodTrendRange = 7;
export const MOOD_TREND_MAX: MoodTrendRange = 90;

export type MoodDay = { date: string; mood: Mood | null };

export function isMoodTrendRange(v: unknown): v is MoodTrendRange {
	return typeof v === 'number' && (MOOD_TREND_RANGES as readonly number[]).includes(v);
}

export function resolveMoodTrendDays(stored: number | null | undefined): MoodTrendRange {
	return isMoodTrendRange(stored) ? stored : MOOD_TREND_DEFAULT;
}

// UTC noon keeps date arithmetic and formatting clear of DST and zone offsets.
function utcNoon(iso: string): Date {
	const [y, m, d] = iso.split('-').map(Number);
	return new Date(Date.UTC(y, m - 1, d, 12));
}

export function addDaysISO(iso: string, n: number): string {
	const d = utcNoon(iso);
	d.setUTCDate(d.getUTCDate() + n);
	return d.toISOString().slice(0, 10);
}

export function buildMoodDays(
	history: { date: string; mood: Mood }[],
	todayISO: string,
	days: number
): MoodDay[] {
	const byDate = new Map(history.map((h) => [h.date, h.mood]));
	const out: MoodDay[] = [];
	for (let i = days - 1; i >= 0; i--) {
		const date = addDaysISO(todayISO, -i);
		out.push({ date, mood: byDate.get(date) ?? null });
	}
	return out;
}

export function toWeekColumns(days: MoodDay[], weekStart: 0 | 1): (MoodDay | null)[][] {
	if (days.length === 0) return [];
	const lead = (utcNoon(days[0].date).getUTCDay() - weekStart + 7) % 7;
	const cells: (MoodDay | null)[] = [...Array<null>(lead).fill(null), ...days];
	while (cells.length % 7 !== 0) cells.push(null);
	const cols: (MoodDay | null)[][] = [];
	for (let i = 0; i < cells.length; i += 7) cols.push(cells.slice(i, i + 7));
	return cols;
}

// Static so server and browser always agree (Intl week info differs by runtime).
export const WEEK_START: Record<Locale, 0 | 1> = { en: 0, pt: 0, de: 1, es: 1, fr: 1, it: 1 };

export const MOOD_TONE: Record<Mood, string> = {
	great: 'bg-teal',
	good: 'bg-teal/55',
	meh: 'bg-muted-foreground/40',
	off: 'bg-gold',
	sick: 'bg-coral'
};

export function formatDayLabel(iso: string, locale: Locale): string {
	return new Intl.DateTimeFormat(locale, {
		weekday: 'short',
		month: 'short',
		day: 'numeric',
		timeZone: 'UTC'
	}).format(utcNoon(iso));
}

export function formatWeekdayShort(iso: string, locale: Locale): string {
	return new Intl.DateTimeFormat(locale, { weekday: 'short', timeZone: 'UTC' }).format(
		utcNoon(iso)
	);
}

// One entry per week column: a short month name where that month starts,
// otherwise null. The first column gets its own month only when the next
// label is at least two columns away, so labels never collide.
export function monthColumnLabels(
	columns: (MoodDay | null)[][],
	locale: Locale
): (string | null)[] {
	const fmt = new Intl.DateTimeFormat(locale, { month: 'short', timeZone: 'UTC' });
	const labels = columns.map((col) => {
		const start = col.find((d) => d?.date.endsWith('-01'));
		return start ? fmt.format(utcNoon(start.date)) : null;
	});
	const next = labels.findIndex((l) => l !== null);
	const first = columns[0]?.find((d) => d !== null);
	if (first && labels[0] === null && (next === -1 || next >= 2)) {
		labels[0] = fmt.format(utcNoon(first.date));
	}
	return labels;
}

// Seven row labels starting at weekStart; rows 0, 2 and 4 are filled
// (Mon/Wed/Fri or Sun/Tue/Thu), the rest stay blank.
export function weekdayRowLabels(weekStart: 0 | 1, locale: Locale): string[] {
	const fmt = new Intl.DateTimeFormat(locale, { weekday: 'short', timeZone: 'UTC' });
	// 2026-09-20 is a Sunday, so adding n days gives weekday n.
	return Array.from({ length: 7 }, (_, r) =>
		r % 2 === 0 && r < 6 ? fmt.format(utcNoon(addDaysISO('2026-09-20', weekStart + r))) : ''
	);
}
