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

export type HealthEventType = 'vet_visit' | 'vaccination' | 'medication' | 'procedure' | 'other';
const HEALTH_EVENT_TYPES = [
	'vet_visit',
	'vaccination',
	'medication',
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

// Reminder recurrence

import {
	RECURRENCE_UNITS,
	RECURRENCE_ANCHORS,
	RECURRENCE_INTERVAL_MAX,
	packMonthDay,
	type RecurrenceUnit,
	type RecurrenceAnchor
} from '$lib/reminderRecurrence';

export function parseRecurrenceUnit(value: string | null | undefined): RecurrenceUnit | null {
	if (!value) return null;
	return parseEnum(value, RECURRENCE_UNITS);
}

export function parseRecurrenceAnchor(value: string | null | undefined): RecurrenceAnchor | null {
	if (!value) return null;
	return parseEnum(value, RECURRENCE_ANCHORS);
}

export type ParsedRecurrence = {
	unit: RecurrenceUnit;
	interval: number;
	anchor: RecurrenceAnchor;
	anchorValue: number | null;
};

/**
 * Parse the recurrence portion of a reminder form payload. Returns null when
 * the form does not describe a valid recurrence (caller treats reminder as
 * non-recurring or returns a validation error).
 *
 * Reads form keys: recurrenceUnit, recurrenceInterval, recurrenceAnchor,
 * recurrenceAnchorValue (day-of-month or weekday), and for year mode the
 * anchorMonth + anchorDay pair which we pack into MMDD storage.
 */
export function parseRecurrence(data: FormData, dueAt: Date): ParsedRecurrence | null {
	const unit = parseRecurrenceUnit(String(data.get('recurrenceUnit') ?? ''));
	if (!unit) return null;

	const rawInterval = parseInt(String(data.get('recurrenceInterval') ?? '0'), 10);
	if (!Number.isFinite(rawInterval) || rawInterval < 1) return null;
	const interval = Math.min(rawInterval, RECURRENCE_INTERVAL_MAX[unit]);

	const anchor =
		parseRecurrenceAnchor(String(data.get('recurrenceAnchor') ?? 'interval')) ?? 'interval';

	let anchorValue: number | null = null;
	if (anchor === 'day_of_week' && unit === 'week') {
		const v = parseInt(String(data.get('recurrenceAnchorValue') ?? ''), 10);
		if (Number.isInteger(v) && v >= 0 && v <= 6) anchorValue = v;
	} else if (anchor === 'day_of_month' && unit === 'month') {
		const v = parseInt(String(data.get('recurrenceAnchorValue') ?? ''), 10);
		if (Number.isInteger(v) && v >= 1 && v <= 31) anchorValue = v;
		else return null;
	} else if (anchor === 'day_of_year' && unit === 'year') {
		const m = parseInt(String(data.get('recurrenceAnchorMonth') ?? ''), 10);
		const d = parseInt(String(data.get('recurrenceAnchorDay') ?? ''), 10);
		if (Number.isInteger(m) && m >= 1 && m <= 12 && Number.isInteger(d) && d >= 1 && d <= 31) {
			anchorValue = packMonthDay(m - 1, d);
		} else {
			return null;
		}
	} else if (anchor === 'interval') {
		// Store the original due-date anchor day so month/year clamping can
		// recover the intended day-of-month across short months.
		if (unit === 'month') anchorValue = dueAt.getDate();
		else if (unit === 'year') anchorValue = packMonthDay(dueAt.getMonth(), dueAt.getDate());
	} else {
		// Invalid (unit, anchor) pairing (e.g. day + day_of_week).
		return null;
	}

	return { unit, interval, anchor, anchorValue };
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
