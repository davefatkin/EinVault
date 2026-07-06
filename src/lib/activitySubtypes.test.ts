import { describe, it, expect } from 'vitest';
import { ACTIVITY_SUBTYPES, activitySubtypesFor, parseSubtype } from './activitySubtypes';

describe('activitySubtypes', () => {
	it('subtype values are globally unique (flat i18n namespace)', () => {
		const all = Object.values(ACTIVITY_SUBTYPES).flat();
		expect(new Set(all).size).toBe(all.length);
	});

	it('accepts a valid subtype for its type', () => {
		expect(parseSubtype('bathroom', 'pee')).toBe('pee');
		expect(parseSubtype('walk', 'hike')).toBe('hike');
		expect(parseSubtype('grooming', 'trim')).toBe('trim');
	});

	it('nulls empty or absent values', () => {
		expect(parseSubtype('bathroom', '')).toBeNull();
		expect(parseSubtype('bathroom', null)).toBeNull();
		expect(parseSubtype('bathroom', undefined)).toBeNull();
	});

	it('rejects a subtype belonging to another type', () => {
		expect(parseSubtype('walk', 'pee')).toBeNull();
		expect(parseSubtype('other', 'pee')).toBeNull();
		expect(parseSubtype('bathroom', 'nope')).toBeNull();
	});

	it('types without entries have no subtypes', () => {
		expect(activitySubtypesFor('other')).toEqual([]);
		expect(activitySubtypesFor('bogus')).toEqual([]);
	});
});
