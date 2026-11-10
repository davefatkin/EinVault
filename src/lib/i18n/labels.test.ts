import { describe, it, expect } from 'vitest';
import {
	ACTIVITY_ICONS,
	activityDisplayIcon,
	activityTypeIcon,
	activityTypeOptions,
	activitySubtypeOptions,
	healthTypeOptions,
	homeSinceLabel,
	speciesLabels
} from './labels';

describe('species-aware icons', () => {
	it('dog renders exactly the base icons', () => {
		for (const [type, icon] of Object.entries(ACTIVITY_ICONS))
			expect(activityTypeIcon(type, 'dog')).toBe(icon);
		expect(activityDisplayIcon('walk', ['leash'], 'dog')).toBe('🐕');
		expect(activityDisplayIcon('play', ['social'], 'dog')).toBe('🐶');
	});
	it('omitting species behaves like dog', () => {
		expect(activityDisplayIcon('walk', null)).toBe('🦮');
	});
	it('cat and other overrides apply', () => {
		expect(activityTypeIcon('walk', 'cat')).toBe('🐈');
		expect(activityTypeIcon('treat', 'cat')).toBe('🐟');
		expect(activityDisplayIcon('walk', ['leash'], 'cat')).toBe('🐈');
		expect(activityDisplayIcon('play', ['social'], 'cat')).toBe('🐱');
		expect(activityTypeIcon('meal', 'other')).toBe('🥬');
		expect(activityTypeIcon('treat', 'other')).toBe('🥕');
	});
	it('keys without an override fall back to the base map', () => {
		expect(activityTypeIcon('grooming', 'cat')).toBe(ACTIVITY_ICONS.grooming);
		expect(activityTypeIcon('litter', 'cat')).toBe('🪣');
	});
	it('a disallowed stored subtype still renders (old data after a species change)', () => {
		expect(activityDisplayIcon('walk', ['hike'], 'cat')).toBe('⛰️');
	});
});

describe('option builders', () => {
	it('healthTypeOptions leaves medication out of add forms only', () => {
		const add = healthTypeOptions('en', { includeMedication: false }).map((o) => o.value);
		const edit = healthTypeOptions('en', { includeMedication: true }).map((o) => o.value);
		expect(add).toEqual(['vet_visit', 'vaccination', 'procedure', 'other']);
		expect(edit).toEqual(['vet_visit', 'vaccination', 'medication', 'procedure', 'other']);
	});
	it('activityTypeOptions defaults to all canonical types', () => {
		expect(activityTypeOptions('en').map((o) => o.value)).toContain('litter');
	});
	it('activityTypeOptions honours a type list and species icons', () => {
		const opts = activityTypeOptions('en', ['walk', 'litter'], 'cat');
		expect(opts.map((o) => o.value)).toEqual(['walk', 'litter']);
		expect(opts[0].icon).toBe('🐈');
		expect(opts[1].label).toBe('Litter box');
		expect(opts[1].hasDuration).toBe(false);
	});
	it('activitySubtypeOptions narrows by species', () => {
		expect(activitySubtypeOptions('en', 'walk', 'cat').map((o) => o.value)).toEqual(['leash']);
		expect(activitySubtypeOptions('en', 'walk').map((o) => o.value)).toEqual([
			'leash',
			'offleash',
			'hike'
		]);
	});
});

describe('speciesLabels', () => {
	it('dog', () => {
		const l = speciesLabels('en', 'dog');
		expect(l).toMatchObject({
			icon: '🐕',
			breedLabel: 'Breed',
			breedPlaceholder: 'Welsh Corgi',
			breedFallback: 'Mixed breed',
			scheduleLabel: 'Walk schedule',
			scheduleCardTitle: 'Walk Schedule',
			scheduleIcon: '🦮'
		});
	});
	it('cat', () => {
		expect(speciesLabels('en', 'cat')).toMatchObject({
			icon: '🐈',
			breedLabel: 'Breed',
			breedPlaceholder: 'Maine Coon',
			breedFallback: 'Mixed breed',
			scheduleLabel: 'Routine',
			scheduleIcon: '🐈'
		});
	});
	it('other', () => {
		expect(speciesLabels('en', 'other')).toMatchObject({
			icon: '🐾',
			breedLabel: 'Type',
			breedPlaceholder: 'Rabbit, goldfish, gecko…',
			breedFallback: 'Other',
			scheduleLabel: 'Care routine',
			scheduleIcon: '🐾'
		});
	});
});

describe('homeSinceLabel', () => {
	it('formats a homecoming date', () => {
		expect(homeSinceLabel('en', '2019-03-04')).toBe('Home since Mar 4, 2019');
	});
	it('is null without a valid date', () => {
		expect(homeSinceLabel('en', null)).toBeNull();
		expect(homeSinceLabel('en', '')).toBeNull();
		expect(homeSinceLabel('en', 'not-a-date')).toBeNull();
	});
});
