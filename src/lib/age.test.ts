import { afterEach, describe, expect, it } from 'vitest';
import { formatAge } from './age';

// Local calendar dates, so the expectations hold in any time zone.
const NOW = new Date(2026, 9, 12, 12, 0);

describe('formatAge (long)', () => {
	const long = (dob: string | null | undefined) => formatAge(dob, 'en', { now: NOW });

	it('is null without a usable dob', () => {
		expect(long(null)).toBeNull();
		expect(long(undefined)).toBeNull();
		expect(long('')).toBeNull();
		expect(long('not a date')).toBeNull();
	});

	it('counts calendar months under a year', () => {
		expect(long('2026-03-15')).toBe('7mo old');
		expect(long('2026-09-30')).toBe('1mo old');
		expect(long('2026-10-01')).toBe('0mo old');
	});

	it('shows years, with the leftover months when there are any', () => {
		expect(long('2022-03-15')).toBe('4y 7mo');
		expect(long('2024-10-01')).toBe('2y old');
		// The day of month is ignored, as the page helpers did.
		expect(long('2025-10-20')).toBe('1y old');
	});

	it('translates, with singular and plural forms', () => {
		const de = (dob: string) => formatAge(dob, 'de', { now: NOW });
		expect(de('2026-09-30')).toBe('1 Monat alt');
		expect(de('2026-03-15')).toBe('7 Monate alt');
		expect(de('2025-10-20')).toBe('1 Jahr alt');
		expect(de('2024-10-01')).toBe('2 Jahre alt');
		expect(de('2022-03-15')).toBe('4 J. 7 Mon.');
	});
});

describe('formatAge (short)', () => {
	const short = (dob: string | null) => formatAge(dob, 'en', { style: 'short', now: NOW });

	it('is null without a dob', () => {
		expect(short(null)).toBeNull();
	});

	it('counts whole years from the last birthday', () => {
		expect(short('2022-03-15')).toBe('4y');
		expect(short('2022-10-20')).toBe('3y');
	});

	it('uses 30-day months under a year', () => {
		expect(short('2026-03-15')).toBe('7mo');
		expect(short('2025-10-20')).toBe('11mo');
	});

	it('translates', () => {
		expect(formatAge('2022-03-15', 'it', { style: 'short', now: NOW })).toBe('4 a');
		expect(formatAge('2026-03-15', 'it', { style: 'short', now: NOW })).toBe('7 m');
	});
});

describe('formatAge in a time zone west of UTC', () => {
	const tz = process.env.TZ;
	afterEach(() => {
		if (tz === undefined) delete process.env.TZ;
		else process.env.TZ = tz;
	});

	it('reads a dob on the 1st as that day, not the evening before', () => {
		process.env.TZ = 'America/Los_Angeles';
		const now = new Date(2026, 2, 12, 12, 0);
		expect(formatAge('2024-03-01', 'en', { now })).toBe('2y old');
		expect(formatAge('2026-02-01', 'en', { now })).toBe('1mo old');
	});
});
