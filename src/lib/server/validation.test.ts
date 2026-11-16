import { describe, it, expect } from 'vitest';
import {
	exceedsLen,
	parseIdArray,
	parseRecordTimestamp,
	parseSpecies,
	parseWeightUnit,
	parseWeightUnitStrict,
	parseDailyEventType,
	parsePillsLeft,
	parseRecurrence,
	keepIntervalAnchor
} from './validation';

describe('exceedsLen', () => {
	it('is true only for strings over the cap', () => {
		expect(exceedsLen('abc', 5)).toBe(false);
		expect(exceedsLen('abcde', 5)).toBe(false);
		expect(exceedsLen('abcdef', 5)).toBe(true);
	});

	it('is false for non-strings (absent/other typed fields)', () => {
		expect(exceedsLen(undefined, 5)).toBe(false);
		expect(exceedsLen(null, 5)).toBe(false);
		expect(exceedsLen(123456, 5)).toBe(false);
	});
});

describe('parseIdArray', () => {
	it('caps a hostile fan-out and dedupes, dropping blanks', () => {
		const ids = Array.from({ length: 60 }, (_, i) => `c${i}`);
		expect(parseIdArray(ids)).toHaveLength(50);
		expect(parseIdArray(['a', 'a', ' ', '', 'b'])).toEqual(['a', 'b']);
	});

	it('returns empty for non-array input', () => {
		expect(parseIdArray('nope')).toEqual([]);
		expect(parseIdArray(undefined)).toEqual([]);
	});
});

describe('parseRecordTimestamp', () => {
	it('accepts an old historical date', () => {
		expect(parseRecordTimestamp('2010-01-01T00:00:00Z')).toBeInstanceOf(Date);
	});
	it('accepts offset form', () => {
		expect(parseRecordTimestamp('2020-06-01T10:00:00+02:00')).toBeInstanceOf(Date);
	});
	it('rejects a far-future date', () => {
		const future = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString();
		expect(parseRecordTimestamp(future)).toBeNull();
	});
	it('rejects garbage and non-strings', () => {
		expect(parseRecordTimestamp('not-a-date')).toBeNull();
		expect(parseRecordTimestamp(42)).toBeNull();
	});
});

describe('parseSpecies', () => {
	it('accepts the three species', () => {
		expect(parseSpecies('dog')).toBe('dog');
		expect(parseSpecies('cat')).toBe('cat');
		expect(parseSpecies('other')).toBe('other');
	});
	it('rejects anything else', () => {
		expect(parseSpecies('horse')).toBeNull();
		expect(parseSpecies('')).toBeNull();
		expect(parseSpecies(null)).toBeNull();
	});
});

describe('parseWeightUnit', () => {
	it('accepts all four units', () => {
		for (const u of ['kg', 'lbs', 'g', 'oz']) expect(parseWeightUnit(u, 'kg')).toBe(u);
	});
	it('falls back to the caller-supplied unit, not kg', () => {
		expect(parseWeightUnit('', 'lbs')).toBe('lbs');
		expect(parseWeightUnit('stone', 'g')).toBe('g');
	});
	it('strict variant returns null on garbage', () => {
		expect(parseWeightUnitStrict('oz')).toBe('oz');
		expect(parseWeightUnitStrict('stone')).toBeNull();
	});
});

describe('parseDailyEventType', () => {
	it('accepts litter', () => {
		expect(parseDailyEventType('litter')).toBe('litter');
	});
});

describe('parsePillsLeft', () => {
	it('treats blank or absent as untracked', () => {
		expect(parsePillsLeft(null)).toBeNull();
		expect(parsePillsLeft('')).toBeNull();
		expect(parsePillsLeft('  ')).toBeNull();
	});

	it('accepts whole numbers from 0 up to the cap', () => {
		expect(parsePillsLeft('0')).toBe(0);
		expect(parsePillsLeft(' 30 ')).toBe(30);
		expect(parsePillsLeft('100000')).toBe(100000);
	});

	it('rejects negatives, fractions, junk, and values over the cap', () => {
		for (const v of ['-1', '1.5', '1e3', 'ten', '100001'])
			expect(parsePillsLeft(v)).toBe('invalid');
	});
});

describe('keepIntervalAnchor', () => {
	function form(unit: string, interval = 1) {
		const fd = new FormData();
		fd.set('recurrenceUnit', unit);
		fd.set('recurrenceInterval', String(interval));
		fd.set('recurrenceAnchor', 'interval');
		return fd;
	}
	const feb28 = new Date(2026, 1, 28, 8, 0);

	it('keeps day 31 when a clamped Feb 28 occurrence is saved unchanged', () => {
		const parsed = parseRecurrence(form('month'), feb28)!;
		expect(parsed.anchorValue).toBe(28); // what the form alone would store
		const kept = keepIntervalAnchor(parsed, feb28, {
			dueAt: feb28,
			recurrenceUnit: 'month',
			recurrenceAnchor: 'interval',
			recurrenceAnchorValue: 31
		});
		expect(kept.anchorValue).toBe(31);
	});

	it('keeps Feb 29 (229) when a common-year Feb 28 occurrence is saved unchanged', () => {
		const parsed = parseRecurrence(form('year'), new Date(2029, 1, 28, 8, 0))!;
		const kept = keepIntervalAnchor(parsed, new Date(2029, 1, 28, 8, 0), {
			dueAt: new Date(2029, 1, 28, 8, 0),
			recurrenceUnit: 'year',
			recurrenceAnchor: 'interval',
			recurrenceAnchorValue: 229
		});
		expect(kept.anchorValue).toBe(229);
	});

	it('keeps the anchor when only the interval changes', () => {
		const kept = keepIntervalAnchor(parseRecurrence(form('month', 2), feb28)!, feb28, {
			dueAt: feb28,
			recurrenceUnit: 'month',
			recurrenceAnchor: 'interval',
			recurrenceAnchorValue: 31
		});
		expect(kept.anchorValue).toBe(31);
	});

	it('re-anchors when the due date or the unit is changed on purpose', () => {
		const existing = {
			dueAt: feb28,
			recurrenceUnit: 'month' as const,
			recurrenceAnchor: 'interval' as const,
			recurrenceAnchorValue: 31
		};
		const moved = new Date(2026, 1, 15, 8, 0);
		expect(
			keepIntervalAnchor(parseRecurrence(form('month'), moved)!, moved, existing).anchorValue
		).toBe(15);
		expect(
			keepIntervalAnchor(parseRecurrence(form('year'), feb28)!, feb28, existing).anchorValue
		).toBe(228);
	});
});
