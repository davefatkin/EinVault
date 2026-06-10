import { describe, it, expect } from 'vitest';
import { packMonthDay, unpackMonthDay, daysInMonth, clampDayOfMonth } from './reminderRecurrence';

describe('packMonthDay / unpackMonthDay', () => {
	it('round-trips every calendar day', () => {
		for (let m = 0; m < 12; m++) {
			for (let d = 1; d <= 31; d++) {
				expect(unpackMonthDay(packMonthDay(m, d))).toEqual({ monthIdx: m, day: d });
			}
		}
	});

	it('packs Feb 29 distinctly from Mar 1 (leap-year safety)', () => {
		expect(packMonthDay(1, 29)).not.toBe(packMonthDay(2, 1));
		expect(packMonthDay(1, 29)).toBe(229);
		expect(packMonthDay(2, 1)).toBe(301);
	});
});

describe('daysInMonth', () => {
	it('knows month lengths', () => {
		expect(daysInMonth(2026, 0)).toBe(31); // Jan
		expect(daysInMonth(2026, 3)).toBe(30); // Apr
	});

	it('handles leap years', () => {
		expect(daysInMonth(2024, 1)).toBe(29); // 2024 leap
		expect(daysInMonth(2026, 1)).toBe(28); // 2026 not
		expect(daysInMonth(2000, 1)).toBe(29); // divisible by 400
		expect(daysInMonth(1900, 1)).toBe(28); // divisible by 100, not 400
	});
});

describe('clampDayOfMonth', () => {
	it('passes through valid days', () => {
		expect(clampDayOfMonth(2026, 0, 31)).toBe(31);
		expect(clampDayOfMonth(2026, 0, 1)).toBe(1);
	});

	it('clamps day 31 to short months', () => {
		expect(clampDayOfMonth(2026, 1, 31)).toBe(28); // Feb non-leap
		expect(clampDayOfMonth(2024, 1, 31)).toBe(29); // Feb leap
		expect(clampDayOfMonth(2026, 3, 31)).toBe(30); // Apr
	});
});
