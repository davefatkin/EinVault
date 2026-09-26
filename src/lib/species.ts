// Per-species activity rules. Client-safe: imported by Svelte components and
// server write paths alike. Must not import from $lib/server.
import {
	DAILY_EVENT_TYPES,
	SPECIES,
	type DailyEventType,
	type Species,
	type WeightUnit
} from '$lib/activityTypes';
import { activitySubtypesFor } from '$lib/activitySubtypes';

export const SPECIES_ICON: Record<Species, string> = { dog: '🐕', cat: '🐈', other: '🐾' };

export const SPECIES_ACTIVITY_TYPES: Record<Species, readonly DailyEventType[]> = {
	dog: ['walk', 'meal', 'bathroom', 'treat', 'play', 'grooming', 'other'],
	cat: ['walk', 'meal', 'litter', 'treat', 'play', 'grooming', 'other'],
	other: ['meal', 'treat', 'play', 'grooming', 'other']
};

export const SPECIES_QUICK_DEFAULTS: Record<Species, readonly DailyEventType[]> = {
	dog: ['walk', 'meal', 'bathroom'],
	cat: ['meal', 'litter', 'play'],
	other: ['meal', 'treat', 'play']
};

// Narrowed subtype lists; a (species, type) pair not listed here uses the
// global ACTIVITY_SUBTYPES list for that type.
const SPECIES_SUBTYPE_OVERRIDES: Record<
	Species,
	Partial<Record<DailyEventType, readonly string[]>>
> = {
	dog: { play: ['fetch', 'tug', 'puzzle', 'social'] },
	cat: { walk: ['leash'], play: ['puzzle', 'social', 'chase'] },
	other: { play: ['puzzle', 'social'] }
};

// Icon overrides keyed by activity type or subtype. Dog has none: it renders
// the base icon maps exactly as before species existed.
export const SPECIES_ICON_OVERRIDES: Record<Species, Partial<Record<string, string>>> = {
	dog: {},
	cat: { walk: '🐈', leash: '🐈', social: '🐱', treat: '🐟' },
	other: { meal: '🥬', treat: '🥕', social: '🐾' }
};

export function isSpecies(v: unknown): v is Species {
	return typeof v === 'string' && (SPECIES as readonly string[]).includes(v);
}

// Coerce a stored/loaded value to a Species. Rows predating the column widening
// are all 'dog', so that is the safe fallback.
export function toSpecies(v: string | null | undefined): Species {
	return isSpecies(v) ? v : 'dog';
}

export function defaultActivityType(species: Species): DailyEventType {
	return SPECIES_ACTIVITY_TYPES[species][0];
}

export function isActivityAllowed(species: Species, type: string): boolean {
	return (SPECIES_ACTIVITY_TYPES[species] as readonly string[]).includes(type);
}

export function subtypesFor(species: Species, type: string): readonly string[] {
	if (!isActivityAllowed(species, type)) return [];
	return SPECIES_SUBTYPE_OVERRIDES[species][type as DailyEventType] ?? activitySubtypesFor(type);
}

export function allowedTypesFor(list: readonly Species[]): DailyEventType[] {
	const set = new Set(list.flatMap((s) => SPECIES_ACTIVITY_TYPES[s]));
	return DAILY_EVENT_TYPES.filter((t) => set.has(t));
}

export function defaultWeightUnit(species: Species): WeightUnit {
	return species === 'other' ? 'g' : 'lbs';
}

export function speciesIcon(species: Species, key: string): string | undefined {
	return SPECIES_ICON_OVERRIDES[species][key];
}
