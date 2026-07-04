import { describe, it, expect } from 'vitest';
import { exceedsLen, parseIdArray, parseRecordTimestamp } from './validation';

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
