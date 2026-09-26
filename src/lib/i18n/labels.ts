import { t } from './index';
import type { Locale, MessageKey } from './index';
import { activitySubtypesFor } from '$lib/activitySubtypes';
import { DAILY_EVENT_TYPES, SPECIES, type DailyEventType, type Species } from '$lib/activityTypes';
import { SPECIES_ICON, speciesIcon, subtypesFor } from '$lib/species';

// Icons are not translatable — they stay constant across locales.

export const MOOD_ICONS: Record<string, string> = {
	great: '🤩',
	good: '😊',
	meh: '😐',
	off: '😕',
	sick: '🤒'
};

export const ACTIVITY_ICONS: Record<string, string> = {
	walk: '🦮',
	meal: '🍖',
	bathroom: '💩',
	litter: '🪣',
	treat: '🦴',
	play: '🎾',
	grooming: '🛁',
	other: '📝'
};

export const REMINDER_ICONS: Record<string, string> = {
	vet: '🏥',
	medication: '💊',
	vaccination: '💉',
	grooming: '✂️',
	other: '📌'
};

export const ACTIVITY_SUBTYPE_ICONS: Record<string, string> = {
	pee: '💧',
	poop: '💩',
	leash: '🐕',
	offleash: '🌳',
	hike: '⛰️',
	breakfast: '🌅',
	lunch: '☀️',
	dinner: '🌙',
	snack: '🍪',
	fetch: '🎾',
	tug: '🪢',
	puzzle: '🧩',
	social: '🐶',
	bath: '🛁',
	brush: '🪮',
	trim: '✂️',
	nails: '💅',
	teeth: '🦷',
	ears: '👂',
	chew: '🦴',
	dental: '🪥',
	training: '🎓',
	scoop: '🧹',
	change: '🔄',
	chase: '🪶'
};

export const ACTIVITY_HAS_DURATION: Record<DailyEventType, boolean> = {
	walk: true,
	meal: false,
	bathroom: false,
	litter: false,
	treat: false,
	play: true,
	grooming: true,
	other: false
};

// Label helpers — translate the text part, icons handled separately.

export function moodLabel(locale: Locale, mood: string): string {
	return t(locale, `enum.mood.${mood}` as MessageKey);
}

export function healthTypeLabel(locale: Locale, type: string): string {
	return t(locale, `enum.healthType.${type}` as MessageKey);
}

export function activityLabel(locale: Locale, type: string): string {
	return t(locale, `enum.activityType.${type}` as MessageKey);
}

export function activitySubtypeLabel(locale: Locale, subtype: string): string {
	return t(locale, `enum.activitySubtype.${subtype}` as MessageKey);
}

// Species icon overrides apply first; dog (and a missing species) render the
// base maps unchanged. Stored subtypes are matched against the GLOBAL list so
// events kept from before a species change still show their icon.
export function activityTypeIcon(type: string, species: Species = 'dog'): string {
	return speciesIcon(species, type) ?? ACTIVITY_ICONS[type] ?? '📝';
}

// Display helpers: the subtype's emoji shows only when exactly one valid
// subtype is set; with zero or multiple subtypes, fall back to the type icon.
export function activityDisplayIcon(
	type: string,
	subtypes?: string[] | null,
	species: Species = 'dog'
): string {
	const valid = subtypes?.filter((s) => activitySubtypesFor(type).includes(s)) ?? [];
	if (valid.length === 1)
		return (
			speciesIcon(species, valid[0]) ??
			ACTIVITY_SUBTYPE_ICONS[valid[0]] ??
			activityTypeIcon(type, species)
		);
	return activityTypeIcon(type, species);
}

export function activityDisplayLabel(
	locale: Locale,
	type: string,
	subtypes?: string[] | null
): string {
	const base = activityLabel(locale, type);
	const valid = subtypes?.filter((s) => activitySubtypesFor(type).includes(s)) ?? [];
	if (valid.length === 0) return base;
	return `${base} · ${valid.map((s) => activitySubtypeLabel(locale, s)).join(' · ')}`;
}

export function reminderTypeLabel(locale: Locale, type: string): string {
	return t(locale, `enum.reminderType.${type}` as MessageKey);
}

export function roleLabel(locale: Locale, role: string): string {
	return t(locale, `enum.role.${role}` as MessageKey);
}

export function sexLabel(locale: Locale, sex: string): string {
	return t(locale, `enum.sex.${sex}` as MessageKey);
}

// Pre-built option lists for <select> elements and filter UIs.

export function moodOptions(locale: Locale) {
	return (['great', 'good', 'meh', 'off', 'sick'] as const).map((v) => ({
		value: v,
		icon: MOOD_ICONS[v],
		label: moodLabel(locale, v)
	}));
}

export function healthTypeOptions(locale: Locale) {
	return (['vet_visit', 'vaccination', 'medication', 'procedure', 'other'] as const).map((v) => ({
		value: v,
		label: healthTypeLabel(locale, v)
	}));
}

export function activityTypeOptions(
	locale: Locale,
	types: readonly DailyEventType[] = DAILY_EVENT_TYPES,
	species: Species = 'dog'
) {
	return types.map((v) => ({
		value: v,
		icon: activityTypeIcon(v, species),
		label: activityLabel(locale, v),
		hasDuration: ACTIVITY_HAS_DURATION[v]
	}));
}

// species omitted → the global subtype list (multi-species pickers). `values`
// gives an explicit list instead; species then only picks the icons.
export function activitySubtypeOptions(
	locale: Locale,
	type: string,
	species?: Species,
	values?: readonly string[]
) {
	const list = values ?? (species ? subtypesFor(species, type) : activitySubtypesFor(type));
	return list.map((v) => ({
		value: v,
		icon: (species && speciesIcon(species, v)) ?? ACTIVITY_SUBTYPE_ICONS[v],
		label: activitySubtypeLabel(locale, v)
	}));
}

export function reminderTypeOptions(locale: Locale) {
	return (['vet', 'medication', 'vaccination', 'grooming', 'other'] as const).map((v) => ({
		value: v,
		icon: REMINDER_ICONS[v],
		label: reminderTypeLabel(locale, v)
	}));
}

export function sexOptions(locale: Locale) {
	return (['male', 'female', 'unknown'] as const).map((v) => ({
		value: v,
		label: sexLabel(locale, v)
	}));
}

export function roleOptions(locale: Locale) {
	return (['admin', 'member', 'caretaker'] as const).map((v) => ({
		value: v,
		label: roleLabel(locale, v)
	}));
}

export function speciesLabel(locale: Locale, species: string): string {
	return t(locale, `enum.species.${species}` as MessageKey);
}

export function speciesOptions(locale: Locale) {
	return SPECIES.map((v) => ({ value: v, icon: SPECIES_ICON[v], label: speciesLabel(locale, v) }));
}

export interface SpeciesLabels {
	icon: string;
	breedLabel: string;
	breedPlaceholder: string;
	breedFallback: string;
	scheduleLabel: string;
	schedulePlaceholder: string;
	scheduleCardTitle: string;
	scheduleIcon: string;
}

// Species-dependent copy for companion forms and cards. Pure (locale passed in),
// so callers use it inside $derived without touching Svelte context.
export function speciesLabels(locale: Locale, species: Species): SpeciesLabels {
	const icon = SPECIES_ICON[species];
	if (species === 'dog')
		return {
			icon,
			breedLabel: t(locale, 'page.companion.labelBreed'),
			breedPlaceholder: t(locale, 'page.companion.placeholderBreed'),
			breedFallback: t(locale, 'page.dashboard.mixedBreed'),
			scheduleLabel: t(locale, 'page.companion.edit.labelWalkSchedule'),
			schedulePlaceholder: t(locale, 'page.companion.edit.placeholderWalkSchedule'),
			scheduleCardTitle: t(locale, 'page.dashboard.caretaker.cardWalk'),
			scheduleIcon: '🦮'
		};
	if (species === 'cat')
		return {
			icon,
			breedLabel: t(locale, 'page.companion.labelBreed'),
			breedPlaceholder: t(locale, 'page.companion.placeholderBreedCat'),
			breedFallback: t(locale, 'page.dashboard.mixedBreed'),
			scheduleLabel: t(locale, 'page.companion.edit.labelRoutine'),
			schedulePlaceholder: t(locale, 'page.companion.edit.placeholderRoutine'),
			scheduleCardTitle: t(locale, 'page.dashboard.caretaker.cardRoutine'),
			scheduleIcon: icon
		};
	return {
		icon,
		breedLabel: t(locale, 'page.companion.labelType'),
		breedPlaceholder: t(locale, 'page.companion.placeholderBreedOther'),
		breedFallback: t(locale, 'enum.species.other'),
		scheduleLabel: t(locale, 'page.companion.edit.labelCareRoutine'),
		schedulePlaceholder: t(locale, 'page.companion.edit.placeholderCareRoutine'),
		scheduleCardTitle: t(locale, 'page.dashboard.caretaker.cardCareRoutine'),
		scheduleIcon: icon
	};
}
