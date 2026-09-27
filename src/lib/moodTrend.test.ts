import { describe, it, expect } from 'vitest';
import {
	addDaysISO,
	buildMoodDays,
	toWeekColumns,
	isMoodTrendRange,
	resolveMoodTrendDays,
	formatDayLabel,
	formatWeekdayShort,
	WEEK_START
} from './moodTrend';

describe('addDaysISO', () => {
	it('crosses month and year boundaries', () => {
		expect(addDaysISO('2026-01-01', -1)).toBe('2025-12-31');
		expect(addDaysISO('2026-02-28', 1)).toBe('2026-03-01');
		expect(addDaysISO('2028-02-28', 1)).toBe('2028-02-29');
	});
	it('is stable across a US DST change', () => {
		expect(addDaysISO('2026-03-07', 1)).toBe('2026-03-08');
		expect(addDaysISO('2026-03-08', 1)).toBe('2026-03-09');
	});
});

describe('buildMoodDays', () => {
	const history = [
		{ date: '2026-09-27', mood: 'good' as const },
		{ date: '2026-09-25', mood: 'sick' as const },
		{ date: '2026-09-01', mood: 'great' as const }
	];

	it('returns one entry per day, oldest first, ending on today', () => {
		const days = buildMoodDays(history, '2026-09-27', 7);
		expect(days).toHaveLength(7);
		expect(days[0].date).toBe('2026-09-21');
		expect(days[6]).toEqual({ date: '2026-09-27', mood: 'good' });
		expect(days[4]).toEqual({ date: '2026-09-25', mood: 'sick' });
		expect(days[5]).toEqual({ date: '2026-09-26', mood: null });
	});

	it('ignores history outside the window', () => {
		const days = buildMoodDays(history, '2026-09-27', 7);
		expect(days.some((d) => d.date === '2026-09-01')).toBe(false);
	});

	it('has no duplicate or missing dates across a year boundary', () => {
		const days = buildMoodDays([], '2026-01-15', 30);
		const dates = days.map((d) => d.date);
		expect(new Set(dates).size).toBe(30);
		expect(dates[0]).toBe('2025-12-17');
		expect(dates[29]).toBe('2026-01-15');
	});
});

describe('toWeekColumns', () => {
	// 2026-09-21 is a Monday.
	const week = buildMoodDays([], '2026-09-27', 7);

	it('Monday start: one full column, no padding', () => {
		const cols = toWeekColumns(week, 1);
		expect(cols).toHaveLength(1);
		expect(cols[0].map((c) => c?.date)).toEqual(week.map((d) => d.date));
	});

	it('Sunday start: pads one slot before Monday and six after Sunday', () => {
		const cols = toWeekColumns(week, 0);
		expect(cols).toHaveLength(2);
		expect(cols[0][0]).toBeNull();
		expect(cols[0][1]?.date).toBe('2026-09-21');
		expect(cols[1][0]?.date).toBe('2026-09-27');
		expect(cols[1].slice(1).every((c) => c === null)).toBe(true);
	});

	it('every column has 7 slots and 90 days fits in 13 or 14 columns', () => {
		const days = buildMoodDays([], '2026-09-27', 90);
		for (const ws of [0, 1] as const) {
			const cols = toWeekColumns(days, ws);
			expect(cols.every((c) => c.length === 7)).toBe(true);
			expect(cols.length === 13 || cols.length === 14).toBe(true);
			expect(cols.flat().filter(Boolean)).toHaveLength(90);
		}
	});

	it('returns [] for no days', () => {
		expect(toWeekColumns([], 1)).toEqual([]);
	});
});

describe('range helpers', () => {
	it('isMoodTrendRange accepts only 7, 30, 90 numbers', () => {
		expect([7, 30, 90].every(isMoodTrendRange)).toBe(true);
		expect(isMoodTrendRange(14)).toBe(false);
		expect(isMoodTrendRange(0)).toBe(false);
		expect(isMoodTrendRange('30')).toBe(false);
		expect(isMoodTrendRange(null)).toBe(false);
	});

	it('resolveMoodTrendDays falls back to 7', () => {
		expect(resolveMoodTrendDays(null)).toBe(7);
		expect(resolveMoodTrendDays(undefined)).toBe(7);
		expect(resolveMoodTrendDays(14)).toBe(7);
		expect(resolveMoodTrendDays(90)).toBe(90);
	});
});

describe('labels', () => {
	it('formats in UTC so the day never shifts', () => {
		expect(formatWeekdayShort('2026-09-21', 'en')).toBe('Mon');
		expect(formatDayLabel('2026-09-21', 'en')).toBe('Mon, Sep 21');
	});

	it('week start map covers every locale', () => {
		expect(WEEK_START).toEqual({ en: 0, pt: 0, de: 1, es: 1, fr: 1, it: 1 });
	});
});
