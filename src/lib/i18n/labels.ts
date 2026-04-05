import { t } from './index';
import type { Locale, MessageKey } from './index';

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

export const ACTIVITY_HAS_DURATION: Record<string, boolean> = {
	walk: true,
	meal: false,
	bathroom: false,
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
	return (['vet_visit', 'vaccination', 'medication', 'weight', 'procedure', 'other'] as const).map(
		(v) => ({
			value: v,
			label: healthTypeLabel(locale, v)
		})
	);
}

export function activityTypeOptions(locale: Locale) {
	return (['walk', 'meal', 'bathroom', 'treat', 'play', 'grooming', 'other'] as const).map((v) => ({
		value: v,
		icon: ACTIVITY_ICONS[v],
		label: activityLabel(locale, v),
		hasDuration: ACTIVITY_HAS_DURATION[v]
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
