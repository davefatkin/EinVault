import { afterEach, describe, expect, it } from 'vitest';
import { daysInMonth, formatDateOnly, parseYmd } from './date';

describe('parseYmd', () => {
	it('parses real calendar dates', () => {
		expect(parseYmd('2024-02-29')).toEqual({ y: 2024, m: 2, d: 29 });
	});
	it('rejects everything else', () => {
		expect(parseYmd('2025-02-29')).toBeNull();
		expect(parseYmd('not a date')).toBeNull();
		expect(parseYmd('2024-3-1')).toBeNull();
		expect(parseYmd(null)).toBeNull();
		expect(parseYmd(undefined)).toBeNull();
	});
});

describe('daysInMonth', () => {
	it('handles leap years', () => {
		expect(daysInMonth(2024, 2)).toBe(29);
		expect(daysInMonth(2025, 2)).toBe(28);
		expect(daysInMonth(2025, 12)).toBe(31);
	});
});

describe('formatDateOnly', () => {
	const tz = process.env.TZ;
	afterEach(() => {
		if (tz === undefined) delete process.env.TZ;
		else process.env.TZ = tz;
	});

	it.each(['Europe/Berlin', 'America/Los_Angeles'])('does not shift the day in %s', (zone) => {
		process.env.TZ = zone;
		expect(formatDateOnly('2019-03-04', 'en')).toBe('Mar 4, 2019');
	});

	it('is null for junk', () => {
		expect(formatDateOnly('nope', 'en')).toBeNull();
	});
});
