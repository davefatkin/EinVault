export const EVENT_TYPES = [
	{ value: 'walk', label: 'Walk', hasDuration: true },
	{ value: 'meal', label: 'Meal', hasDuration: false },
	{ value: 'bathroom', label: 'Bathroom', hasDuration: false },
	{ value: 'treat', label: 'Treat', hasDuration: false },
	{ value: 'play', label: 'Play', hasDuration: true },
	{ value: 'grooming', label: 'Grooming', hasDuration: true },
	{ value: 'other', label: 'Other', hasDuration: false }
] as const;

export const ACTIVITY_ICONS: Record<(typeof EVENT_TYPES)[number]['value'], string> = {
	walk: '🦮',
	meal: '🍖',
	bathroom: '💩',
	treat: '🦴',
	play: '🎾',
	grooming: '🛁',
	other: '📝'
};
