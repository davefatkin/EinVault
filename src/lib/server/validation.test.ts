import { describe, it, expect } from 'vitest';
import { exceedsLen, parseIdArray } from './validation';

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
