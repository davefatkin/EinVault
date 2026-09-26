// Canonical enum tuples shared by the DB schema, server validation, OpenAPI,
// and Svelte components. Zero imports on purpose: schema.ts pulls this in by
// relative path from contexts outside Vite (drizzle-kit, the Playwright seed).

export const DAILY_EVENT_TYPES = [
	'walk',
	'meal',
	'bathroom',
	'litter',
	'treat',
	'play',
	'grooming',
	'other'
] as const;
export type DailyEventType = (typeof DAILY_EVENT_TYPES)[number];

export const WEIGHT_UNITS = ['kg', 'lbs', 'g', 'oz'] as const;
export type WeightUnit = (typeof WEIGHT_UNITS)[number];

export const SPECIES = ['dog', 'cat', 'other'] as const;
export type Species = (typeof SPECIES)[number];
