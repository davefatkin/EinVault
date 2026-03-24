function parseEnum<T extends string>(value: string, valid: readonly T[]): T | null {
	return valid.includes(value as T) ? (value as T) : null;
}

// Mood

export type Mood = 'great' | 'good' | 'meh' | 'off' | 'sick';
const MOODS = ['great', 'good', 'meh', 'off', 'sick'] as const satisfies readonly Mood[];

export function parseMood(value: string | null | undefined): Mood | null {
	if (!value) return null;
	return parseEnum(value, MOODS);
}

// Daily event type

export type DailyEventType = 'walk' | 'meal' | 'bathroom' | 'treat' | 'play' | 'grooming' | 'other';
const DAILY_EVENT_TYPES = [
	'walk',
	'meal',
	'bathroom',
	'treat',
	'play',
	'grooming',
	'other'
] as const satisfies readonly DailyEventType[];

export function parseDailyEventType(value: string): DailyEventType | null {
	return parseEnum(value, DAILY_EVENT_TYPES);
}

// Health event type

export type HealthEventType =
	| 'vet_visit'
	| 'vaccination'
	| 'medication'
	| 'weight'
	| 'procedure'
	| 'other';
const HEALTH_EVENT_TYPES = [
	'vet_visit',
	'vaccination',
	'medication',
	'weight',
	'procedure',
	'other'
] as const satisfies readonly HealthEventType[];

export function parseHealthEventType(value: string): HealthEventType | null {
	return parseEnum(value, HEALTH_EVENT_TYPES);
}

// Reminder type

export type ReminderType = 'vet' | 'medication' | 'vaccination' | 'grooming' | 'other';
const REMINDER_TYPES = [
	'vet',
	'medication',
	'vaccination',
	'grooming',
	'other'
] as const satisfies readonly ReminderType[];

export function parseReminderType(value: string): ReminderType {
	return parseEnum(value, REMINDER_TYPES) ?? 'other';
}

// Weight unit

export type WeightUnit = 'kg' | 'lbs';
const WEIGHT_UNITS = ['kg', 'lbs'] as const satisfies readonly WeightUnit[];

export function parseWeightUnit(value: string): WeightUnit {
	return parseEnum(value, WEIGHT_UNITS) ?? 'kg';
}

// Date validation

export function isValidDate(date: string): boolean {
	if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return false;
	const [year, month, day] = date.split('-').map(Number);
	const d = new Date(Date.UTC(year, month - 1, day));
	return d.getUTCFullYear() === year && d.getUTCMonth() === month - 1 && d.getUTCDate() === day;
}

// User role

export type UserRole = 'admin' | 'member' | 'caretaker';
const USER_ROLES = ['admin', 'member', 'caretaker'] as const satisfies readonly UserRole[];

export function parseRole(value: string): UserRole | null {
	return parseEnum(value, USER_ROLES);
}

// Sex

export type Sex = 'male' | 'female' | 'unknown';
const SEXES = ['male', 'female', 'unknown'] as const satisfies readonly Sex[];

export function parseSex(value: string): Sex | null {
	return parseEnum(value, SEXES);
}
