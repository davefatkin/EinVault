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
