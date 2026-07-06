import { describe, it, expect } from 'vitest';
import { ACTIVITY_SUBTYPES, activitySubtypesFor, parseSubtypes } from './activitySubtypes';

describe('activitySubtypes', () => {
	it('subtype values are globally unique (flat i18n namespace)', () => {
		const all = Object.values(ACTIVITY_SUBTYPES).flat();
		expect(new Set(all).size).toBe(all.length);
	});

	it('keeps valid values in registry order regardless of input order', () => {
		expect(parseSubtypes('grooming', ['nails', 'bath'])).toEqual(['bath', 'nails']);
		expect(parseSubtypes('bathroom', ['poop', 'pee'])).toEqual(['pee', 'poop']);
	});

	it('dedupes repeated values', () => {
		expect(parseSubtypes('bathroom', ['pee', 'pee'])).toEqual(['pee']);
	});

	it('drops values belonging to another type', () => {
		expect(parseSubtypes('walk', ['pee', 'leash'])).toEqual(['leash']);
		expect(parseSubtypes('bathroom', ['nope'])).toEqual([]);
	});

	it('accepts a single string', () => {
		expect(parseSubtypes('bathroom', 'pee')).toEqual(['pee']);
	});

	it('returns empty for empty or absent values', () => {
		expect(parseSubtypes('bathroom', '')).toEqual([]);
		expect(parseSubtypes('bathroom', null)).toEqual([]);
		expect(parseSubtypes('bathroom', undefined)).toEqual([]);
		expect(parseSubtypes('bathroom', [])).toEqual([]);
	});

	it('types without entries have no subtypes', () => {
		expect(activitySubtypesFor('other')).toEqual([]);
		expect(activitySubtypesFor('bogus')).toEqual([]);
		expect(parseSubtypes('other', ['pee'])).toEqual([]);
	});
});
