import { describe, expect, it } from 'vitest';
import { ageParts, formatAge, formatFullAge } from './age';

describe('ageParts', () => {
	const P = (dob: string, today: string) => ageParts(dob, today);

	it('counts whole calendar months and leftover days', () => {
		expect(P('2026-06-29', '2026-10-03')).toEqual({ years: 0, months: 3, days: 4 });
		expect(P('2026-01-31', '2026-02-28')).toEqual({ years: 0, months: 1, days: 0 });
		expect(P('2026-01-31', '2026-03-01')).toEqual({ years: 0, months: 1, days: 1 });
		expect(P('2026-01-31', '2026-03-30')).toEqual({ years: 0, months: 1, days: 30 });
		expect(P('2026-01-31', '2026-03-31')).toEqual({ years: 0, months: 2, days: 0 });
		for (const dob of ['2026-01-29', '2026-01-30', '2026-01-31'])
			expect(P(dob, '2026-02-28')).toEqual({ years: 0, months: 1, days: 0 });
	});

	it('handles leap-day dobs', () => {
		expect(P('2024-02-29', '2025-02-28')).toEqual({ years: 1, months: 0, days: 0 });
		expect(P('2024-02-29', '2025-03-01')).toEqual({ years: 1, months: 0, days: 1 });
		expect(P('2024-02-29', '2028-02-28')).toEqual({ years: 3, months: 11, days: 30 });
		expect(P('2024-02-29', '2028-02-29')).toEqual({ years: 4, months: 0, days: 0 });
	});

	it('handles today, future, and junk', () => {
		expect(P('2026-10-12', '2026-10-12')).toEqual({ years: 0, months: 0, days: 0 });
		expect(P('2026-10-13', '2026-10-12')).toBeNull();
		expect(P('not a date', '2026-10-12')).toBeNull();
	});
});

describe('formatAge', () => {
	const today = '2026-10-12';
	const long = (dob: string | null | undefined) => formatAge(dob, 'en', { today });
	const short = (dob: string, t = today) => formatAge(dob, 'en', { today: t, style: 'short' });
	const approx = (dob: string, style?: 'long' | 'short') =>
		formatAge(dob, 'en', { today, style, approximate: true });

	it('is null without a usable dob', () => {
		expect(long(null)).toBeNull();
		expect(long(undefined)).toBeNull();
		expect(long('')).toBeNull();
		expect(long('not a date')).toBeNull();
	});

	it('long', () => {
		expect(long('2026-09-30')).toBe('12d old');
		expect(long('2026-10-12')).toBe('0d old');
		expect(long('2026-06-08')).toBe('4mo 4d old');
		expect(long('2026-03-12')).toBe('7mo old');
		expect(long('2022-03-15')).toBe('4y 6mo');
		expect(long('2024-10-12')).toBe('2y old');
		expect(long('2025-10-20')).toBe('11mo 22d old');
	});

	it('short', () => {
		expect(short('2026-09-30')).toBe('12d');
		expect(short('2026-06-08')).toBe('4mo 4d');
		expect(short('2022-10-20')).toBe('3y');
		expect(short('2024-02-29', '2025-02-28')).toBe('1y');
	});

	it('approximate', () => {
		expect(approx('2026-10-01')).toBe('~1mo old');
		expect(approx('2026-10-01', 'short')).toBe('~1mo');
		expect(approx('2026-06-08')).toBe('~4mo old');
		expect(approx('2026-06-08', 'short')).toBe('~4mo');
		expect(approx('2017-01-01')).toBe('~9y old');
		expect(approx('2017-01-01', 'short')).toBe('~9y');
	});

	it('translates', () => {
		expect(formatAge('2026-09-12', 'de', { today })).toBe('1 Monat alt');
		expect(formatAge('2022-03-15', 'de', { today })).toBe('4 J. 6 Mon.');
	});
});

describe('formatFullAge', () => {
	const today = '2026-11-03';
	it('joins non-zero units', () => {
		expect(formatFullAge('2024-04-22', 'en', { today })).toBe('2 years, 6 months, 12 days');
		expect(formatFullAge('2025-11-03', 'en', { today })).toBe('1 year');
		expect(formatFullAge('2024-10-03', 'en', { today })).toBe('2 years, 1 month');
		expect(formatFullAge('2026-11-03', 'en', { today })).toBe('0 days');
		expect(formatFullAge('junk', 'en', { today })).toBeNull();
	});
	it('localizes', () => {
		expect(formatFullAge('2024-04-22', 'de', { today })).toBe('2 Jahre, 6 Monate und 12 Tage');
		expect(formatFullAge('2024-04-22', 'fr', { today })).toContain(' et 12 jours');
	});
});
