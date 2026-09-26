import { describe, it, expect } from 'vitest';
import { ACTIVITY_SUBTYPES, activitySubtypesFor, parseSubtypes } from './activitySubtypes';

describe('activitySubtypes', () => {
	it('a subtype key shared across types is only pee/poop (bathroom and litter)', () => {
		const seen = new Map<string, string[]>();
		for (const [type, list] of Object.entries(ACTIVITY_SUBTYPES))
			for (const v of list) seen.set(v, [...(seen.get(v) ?? []), type]);
		const shared = [...seen]
			.filter(([, types]) => types.length > 1)
			.map(([v]) => v)
			.sort();
		expect(shared).toEqual(['pee', 'poop']);
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

	it('drops values not valid for litter', () => {
		expect(parseSubtypes('litter', ['pee', 'scoop', 'bogus'])).toEqual(['pee', 'scoop']);
	});
});
