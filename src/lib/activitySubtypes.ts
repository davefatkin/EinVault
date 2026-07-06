// Allowed subtype values per daily-event type. Client-safe (imported by Svelte
// components AND server validation) — must not import from $lib/server.
// Values are globally unique across types so i18n can use a flat
// enum.activitySubtype.* namespace.
export const ACTIVITY_SUBTYPES = {
	bathroom: ['pee', 'poop', 'both'],
	walk: ['leash', 'offleash', 'hike'],
	meal: ['breakfast', 'lunch', 'dinner', 'snack'],
	play: ['fetch', 'tug', 'puzzle', 'social'],
	grooming: ['bath', 'brush', 'trim', 'nails', 'teeth', 'ears'],
	treat: ['chew', 'dental', 'training']
} as const;

export type SubtypedActivityType = keyof typeof ACTIVITY_SUBTYPES;
export type ActivitySubtype = (typeof ACTIVITY_SUBTYPES)[SubtypedActivityType][number];

export function activitySubtypesFor(type: string): readonly string[] {
	return (ACTIVITY_SUBTYPES as Record<string, readonly string[]>)[type] ?? [];
}

// parse* convention (see $server/validation.ts): invalid/empty → null, never
// throws. The Bearer API layers an explicit 400 on top for machine clients.
export function parseSubtype(type: string, value: unknown): string | null {
	if (typeof value !== 'string' || value === '') return null;
	return activitySubtypesFor(type).includes(value) ? value : null;
}
