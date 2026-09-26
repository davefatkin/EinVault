import { describe, it, expect } from 'vitest';
import {
	SPECIES_ACTIVITY_TYPES,
	SPECIES_QUICK_DEFAULTS,
	isSpecies,
	toSpecies,
	defaultActivityType,
	isActivityAllowed,
	subtypesFor,
	subtypesForAny,
	subtypesKeepingSaved,
	allowedTypesFor,
	defaultWeightUnit,
	speciesIcon
} from './species';
import { DAILY_EVENT_TYPES } from './activityTypes';

describe('species maps', () => {
	it('dog keeps the original seven types in order', () => {
		expect(SPECIES_ACTIVITY_TYPES.dog).toEqual([
			'walk',
			'meal',
			'bathroom',
			'treat',
			'play',
			'grooming',
			'other'
		]);
	});
	it('cat swaps bathroom for litter and keeps walk', () => {
		expect(SPECIES_ACTIVITY_TYPES.cat).toEqual([
			'walk',
			'meal',
			'litter',
			'treat',
			'play',
			'grooming',
			'other'
		]);
	});
	it('other has no walk, bathroom or litter', () => {
		expect(SPECIES_ACTIVITY_TYPES.other).toEqual(['meal', 'treat', 'play', 'grooming', 'other']);
	});
	it('every allowed type is a canonical type', () => {
		for (const list of Object.values(SPECIES_ACTIVITY_TYPES))
			for (const t of list) expect(DAILY_EVENT_TYPES).toContain(t);
	});
	it('quick defaults are allowed for their species', () => {
		for (const [s, list] of Object.entries(SPECIES_QUICK_DEFAULTS))
			for (const t of list) expect(isActivityAllowed(s as never, t)).toBe(true);
	});
});

describe('helpers', () => {
	it('isSpecies / toSpecies', () => {
		expect(isSpecies('cat')).toBe(true);
		expect(isSpecies('horse')).toBe(false);
		expect(toSpecies('other')).toBe('other');
		expect(toSpecies('horse')).toBe('dog');
		expect(toSpecies(null)).toBe('dog');
	});
	it('defaultActivityType', () => {
		expect(defaultActivityType('dog')).toBe('walk');
		expect(defaultActivityType('cat')).toBe('walk');
		expect(defaultActivityType('other')).toBe('meal');
	});
	it('isActivityAllowed', () => {
		expect(isActivityAllowed('dog', 'bathroom')).toBe(true);
		expect(isActivityAllowed('dog', 'litter')).toBe(false);
		expect(isActivityAllowed('cat', 'bathroom')).toBe(false);
		expect(isActivityAllowed('other', 'walk')).toBe(false);
		expect(isActivityAllowed('dog', 'nonsense')).toBe(false);
	});
	it('subtypesFor narrows per species', () => {
		expect(subtypesFor('dog', 'walk')).toEqual(['leash', 'offleash', 'hike']);
		expect(subtypesFor('cat', 'walk')).toEqual(['leash']);
		expect(subtypesFor('dog', 'play')).toEqual(['fetch', 'tug', 'puzzle', 'social']);
		expect(subtypesFor('cat', 'play')).toEqual(['puzzle', 'social', 'chase']);
		expect(subtypesFor('other', 'play')).toEqual(['puzzle', 'social']);
		expect(subtypesFor('cat', 'litter')).toEqual(['pee', 'poop', 'scoop', 'change']);
		expect(subtypesFor('dog', 'litter')).toEqual([]);
		expect(subtypesFor('other', 'meal')).toEqual(['breakfast', 'lunch', 'dinner', 'snack']);
	});
	it('allowedTypesFor unions in canonical order', () => {
		expect(allowedTypesFor(['dog', 'cat'])).toEqual([
			'walk',
			'meal',
			'bathroom',
			'litter',
			'treat',
			'play',
			'grooming',
			'other'
		]);
		expect(allowedTypesFor(['other'])).toEqual(SPECIES_ACTIVITY_TYPES.other);
		expect(allowedTypesFor([])).toEqual([]);
	});
	it('defaultWeightUnit', () => {
		expect(defaultWeightUnit('dog')).toBe('lbs');
		expect(defaultWeightUnit('cat')).toBe('lbs');
		expect(defaultWeightUnit('other')).toBe('g');
	});
	it('speciesIcon returns overrides only', () => {
		expect(speciesIcon('dog', 'walk')).toBeUndefined();
		expect(speciesIcon('cat', 'walk')).toBe('🐈');
		expect(speciesIcon('cat', 'leash')).toBe('🐈');
		expect(speciesIcon('cat', 'social')).toBe('🐱');
		expect(speciesIcon('cat', 'treat')).toBe('🐟');
		expect(speciesIcon('other', 'meal')).toBe('🥬');
		expect(speciesIcon('other', 'treat')).toBe('🥕');
		expect(speciesIcon('other', 'social')).toBe('🐾');
		expect(speciesIcon('cat', 'grooming')).toBeUndefined();
	});
});

describe('subtypesForAny', () => {
	it('unions the species lists in registry order', () => {
		expect(subtypesForAny(['cat'], 'walk')).toEqual(['leash']);
		expect(subtypesForAny(['cat', 'dog'], 'walk')).toEqual(['leash', 'offleash', 'hike']);
		expect(subtypesForAny(['dog', 'cat'], 'play')).toEqual([
			'fetch',
			'tug',
			'puzzle',
			'social',
			'chase'
		]);
	});

	it('is empty when no species can have the type or none are given', () => {
		expect(subtypesForAny(['cat'], 'bathroom')).toEqual([]);
		expect(subtypesForAny([], 'walk')).toEqual([]);
	});
});

describe('subtypesKeepingSaved', () => {
	it('adds saved values to the species list without other out-of-species ones', () => {
		expect(subtypesKeepingSaved('cat', 'walk', ['hike'])).toEqual(['leash', 'hike']);
		expect(subtypesKeepingSaved('cat', 'walk', [])).toEqual(['leash']);
	});

	it('ignores saved values that do not belong to the type', () => {
		expect(subtypesKeepingSaved('cat', 'walk', ['pee'])).toEqual(['leash']);
	});
});
