import { afterEach, describe, expect, it } from 'vitest';
import { formatLocalTime } from './localTime.js';

// ICU puts a narrow no-break space before AM/PM on newer Node versions.
const norm = (s: string | undefined) => s?.replace(/\s/g, ' ');

const ORIGINAL_TZ = process.env.TZ;
afterEach(() => {
	if (ORIGINAL_TZ === undefined) delete process.env.TZ;
	else process.env.TZ = ORIGINAL_TZ;
});

const NOW = Date.UTC(2026, 2, 4, 18, 0);

describe('formatLocalTime: date-only values', () => {
	it('keeps the calendar day when the runtime is east of the household zone', () => {
		process.env.TZ = 'Asia/Tokyo';
		const out = formatLocalTime('2019-03-04', {
			locale: 'en',
			timeZone: 'America/Los_Angeles',
			now: NOW
		});
		expect(out).toEqual({ display: 'Mar 4, 2019', datetime: '2019-03-04' });
	});

	it('keeps the calendar day when the runtime is west of the household zone', () => {
		process.env.TZ = 'Pacific/Honolulu';
		const out = formatLocalTime('2019-03-04', {
			locale: 'en',
			timeZone: 'Europe/Berlin',
			now: NOW
		});
		expect(out).toEqual({ display: 'Mar 4, 2019', datetime: '2019-03-04' });
	});

	it('ignores the format for date-only input', () => {
		const out = formatLocalTime('2019-03-04', { format: 'time', locale: 'en', now: NOW });
		expect(out?.display).toBe('Mar 4, 2019');
	});

	it('uses the app locale, matching the timestamp date style', () => {
		const out = formatLocalTime('2019-03-04', { locale: 'de', now: NOW });
		expect(out?.display).toBe('4. März 2019');
		const ts = formatLocalTime('2019-03-04T12:00:00Z', { locale: 'de', timeZone: 'UTC', now: NOW });
		expect(ts?.display).toBe(out?.display);
	});

	it('rejects impossible dates', () => {
		expect(formatLocalTime('2019-02-30', { locale: 'en', now: NOW })).toBeNull();
	});
});

describe('formatLocalTime: timestamps', () => {
	const ts = '2026-03-04T07:30:00Z';

	it('formats in the household zone, not the runtime zone', () => {
		process.env.TZ = 'Asia/Tokyo';
		const out = formatLocalTime(ts, { locale: 'en', timeZone: 'America/Los_Angeles', now: NOW });
		expect(out).toEqual({ display: 'Mar 3, 2026', datetime: '2026-03-04T07:30:00.000Z' });
	});

	it('uses the app locale for date, datetime and time', () => {
		const opts = { locale: 'de', timeZone: 'Europe/Berlin', now: NOW } as const;
		expect(formatLocalTime(ts, opts)?.display).toBe('4. März 2026');
		expect(norm(formatLocalTime(ts, { ...opts, format: 'datetime' })?.display)).toBe(
			'4. März 2026, 8:30'
		);
		expect(formatLocalTime(ts, { ...opts, format: 'time' })?.display).toBe('8:30');
	});

	it('formats time in en', () => {
		const out = formatLocalTime(ts, {
			format: 'time',
			locale: 'en',
			timeZone: 'UTC',
			now: NOW
		});
		expect(norm(out?.display)).toBe('7:30 AM');
	});

	it('uses translated relative strings for recent values', () => {
		const opts = { format: 'relative', locale: 'en', now: NOW } as const;
		expect(formatLocalTime(NOW - 30_000, opts)?.display).toBe('just now');
		expect(formatLocalTime(NOW - 5 * 60_000, opts)?.display).toMatch(/5/);
		expect(formatLocalTime(NOW - 3 * 3_600_000, opts)?.display).toMatch(/3/);
	});

	it('falls back to a localized short date for older relative values', () => {
		const out = formatLocalTime(NOW - 30 * 86_400_000, {
			format: 'relative',
			locale: 'de',
			timeZone: 'UTC',
			now: NOW
		});
		expect(out?.display).toBe('2. Feb.');
	});

	it('accepts Date and number input', () => {
		const opts = { locale: 'en', timeZone: 'UTC', now: NOW } as const;
		expect(formatLocalTime(new Date(ts), opts)?.display).toBe('Mar 4, 2026');
		expect(formatLocalTime(Date.parse(ts), opts)?.display).toBe('Mar 4, 2026');
	});

	it('returns null for empty or invalid input', () => {
		const opts = { locale: 'en', now: NOW } as const;
		expect(formatLocalTime(null, opts)).toBeNull();
		expect(formatLocalTime('', opts)).toBeNull();
		expect(formatLocalTime('not a date', opts)).toBeNull();
		expect(formatLocalTime(new Date(NaN), opts)).toBeNull();
	});
});
