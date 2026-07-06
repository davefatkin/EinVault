// Allowed subtype values per daily-event type. Client-safe (imported by Svelte
// components AND server validation) — must not import from $lib/server.
// Values are globally unique across types so i18n can use a flat
// enum.activitySubtype.* namespace.
export const ACTIVITY_SUBTYPES = {
	bathroom: ['pee', 'poop'],
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

// Normalizes a set of subtype values for a type: keeps only allowed values,
// dedupes, and returns them in registry order for stable display. Invalid
// values are dropped silently (parse* convention); the Bearer API layers a
// hard 400 on top. Accepts an array (FormData.getAll / JSON body) or a
// single string.
export function parseSubtypes(type: string, value: unknown): string[] {
	const allowed = activitySubtypesFor(type);
	if (allowed.length === 0) return [];
	const raw = Array.isArray(value) ? value : typeof value === 'string' && value ? [value] : [];
	const chosen = new Set(raw.filter((v): v is string => typeof v === 'string'));
	return allowed.filter((v) => chosen.has(v));
}
