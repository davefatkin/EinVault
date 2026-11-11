// Pin a DST-observing zone so the DST assertions cross a real boundary even in UTC CI.
process.env.TZ = 'America/New_York';

import { describe, expect, it } from 'vitest';
import {
	LEAD_DAY_PRESETS,
	MAX_LEAD_DAYS,
	MAX_LEAD_TIMES,
	daysUntil,
	formatLeadDays,
	leadTime,
	parseLeadDays,
	repeatPeriodDays,
	serializeLeadDays,
	validateLeadDays
} from './reminderLeadTimes.js';

describe('constants', () => {
	it('exposes presets and caps', () => {
		expect([...LEAD_DAY_PRESETS]).toEqual([1, 2, 3, 7, 14, 30]);
		expect(MAX_LEAD_TIMES).toBe(3);
		expect(MAX_LEAD_DAYS).toBe(90);
	});
});

describe('parse/serialize', () => {
	it('serializes distinct descending', () => {
		expect(serializeLeadDays([2, 7, 2])).toBe('7,2');
		expect(serializeLeadDays([])).toBeNull();
	});
	it('parses tolerantly', () => {
		expect(parseLeadDays('7,x,2')).toEqual([7, 2]);
		expect(parseLeadDays('2,7,2')).toEqual([7, 2]);
		expect(parseLeadDays(null)).toEqual([]);
		expect(parseLeadDays(undefined)).toEqual([]);
		expect(parseLeadDays('')).toEqual([]);
		expect(parseLeadDays('0,-1,1.5,91')).toEqual([]);
	});
});

describe('repeatPeriodDays', () => {
	it('multiplies unit by interval', () => {
		expect(repeatPeriodDays('day', 3)).toBe(3);
		expect(repeatPeriodDays('week', 2)).toBe(14);
		expect(repeatPeriodDays('month', 1)).toBe(28);
		expect(repeatPeriodDays('year', 1)).toBe(365);
	});
});

describe('validateLeadDays', () => {
	it('accepts empty as null', () => {
		expect(validateLeadDays('', null)).toEqual({ ok: true, value: null });
	});
	it('canonicalizes', () => {
		expect(validateLeadDays('2, 7', null)).toEqual({ ok: true, value: '7,2' });
	});
	it.each(['0', '91', '1.5', 'abc', '7,,2', '7,7'])('rejects %s as invalid', (raw) => {
		expect(validateLeadDays(raw, null)).toEqual({ ok: false, reason: 'invalid' });
	});
	it('rejects four values', () => {
		expect(validateLeadDays('1,2,3,7', null)).toEqual({ ok: false, reason: 'tooMany' });
	});
	it('rejects leads as long as the repeat', () => {
		expect(validateLeadDays('7', { unit: 'week', interval: 1 })).toEqual({
			ok: false,
			reason: 'tooLong'
		});
		expect(validateLeadDays('7', { unit: 'week', interval: 2 })).toEqual({
			ok: true,
			value: '7'
		});
	});
});

describe('leadTime', () => {
	it('moves back local calendar days', () => {
		const r = leadTime(new Date(2026, 2, 10, 9, 0), 7);
		expect([r.getFullYear(), r.getMonth(), r.getDate(), r.getHours(), r.getMinutes()]).toEqual([
			2026, 2, 3, 9, 0
		]);
	});
	it('keeps local wall time across the US DST change', () => {
		const r = leadTime(new Date(2026, 2, 10, 9, 0), 7);
		expect(r.getHours()).toBe(9);
		const r2 = leadTime(new Date(2026, 2, 9, 9, 0), 2);
		expect([r2.getDate(), r2.getHours()]).toEqual([7, 9]);
		const r3 = leadTime(new Date(2026, 2, 8, 9, 0), 1);
		expect([r3.getDate(), r3.getHours()]).toEqual([7, 9]);
	});
	it('is not plain millisecond arithmetic across the change', () => {
		const due = new Date(2026, 2, 10, 9, 0);
		const r = leadTime(due, 7);
		expect(r.getHours()).toBe(9);
		expect(due.getTime() - r.getTime()).not.toBe(7 * 24 * 3600 * 1000);
	});
});

describe('daysUntil', () => {
	it('is 0 on the same day', () => {
		expect(daysUntil(new Date(2026, 5, 10, 23, 0), new Date(2026, 5, 10, 1, 0))).toBe(0);
	});
	it('is 1 for tomorrow just after midnight', () => {
		expect(daysUntil(new Date(2026, 5, 11, 0, 30), new Date(2026, 5, 10, 23, 50))).toBe(1);
	});
	it('counts calendar days across DST', () => {
		expect(daysUntil(new Date(2026, 2, 10, 9, 0), new Date(2026, 2, 3, 9, 0))).toBe(7);
	});
});

describe('formatLeadDays', () => {
	it('formats lists in English', () => {
		expect(formatLeadDays('en', [1])).toBe('Heads-up 1 day before');
		expect(formatLeadDays('en', [7, 2])).toBe('Heads-up 7 days and 2 days before');
		expect(formatLeadDays('en', [7, 2, 1])).toBe('Heads-up 7 days, 2 days and 1 day before');
	});
	it('returns empty for none', () => {
		expect(formatLeadDays('en', [])).toBe('');
	});
});

describe('pruneLeadDays / leadChipOptions', () => {
	it('keeps custom leads when not recurring', async () => {
		const m = await import('./reminderLeadTimes.js');
		expect(m.pruneLeadDays([10, 2], null)).toEqual([10, 2]);
		expect(m.leadChipOptions([10], null)).toEqual([1, 2, 3, 7, 10, 14, 30]);
	});
	it('drops leads at or past the repeat period', async () => {
		const m = await import('./reminderLeadTimes.js');
		const weekly = { unit: 'week' as const, interval: 1 };
		expect(m.pruneLeadDays([10, 7, 3], weekly)).toEqual([3]);
		expect(m.leadChipOptions([3], weekly)).toEqual([1, 2, 3]);
	});
});

describe('maxLeadDays', () => {
	it('is the global cap when not recurring', async () => {
		const m = await import('./reminderLeadTimes.js');
		expect(m.maxLeadDays(null)).toBe(90);
	});
	it('stays a day shorter than the repeat period', async () => {
		const m = await import('./reminderLeadTimes.js');
		expect(m.maxLeadDays({ unit: 'week', interval: 1 })).toBe(6);
		expect(m.maxLeadDays({ unit: 'month', interval: 1 })).toBe(27);
		expect(m.maxLeadDays({ unit: 'year', interval: 1 })).toBe(90);
		expect(m.maxLeadDays({ unit: 'day', interval: 1 })).toBe(0);
	});
});
