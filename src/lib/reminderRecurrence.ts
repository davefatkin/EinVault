// Client-safe types, constants, and formatting helpers for reminder recurrence.
// Imported by both server validators/advancement code and client UI. Must not
// import $env or $lib/server modules so the browser bundle stays clean.

import type { Locale } from '$lib/i18n';
import { t } from '$lib/i18n';

export type RecurrenceUnit = 'day' | 'week' | 'month' | 'year';
export const RECURRENCE_UNITS = [
	'day',
	'week',
	'month',
	'year'
] as const satisfies readonly RecurrenceUnit[];

export type RecurrenceAnchor = 'interval' | 'day_of_week' | 'day_of_month' | 'day_of_year';
export const RECURRENCE_ANCHORS = [
	'interval',
	'day_of_week',
	'day_of_month',
	'day_of_year'
] as const satisfies readonly RecurrenceAnchor[];

// Per-unit interval caps. Prevents runaway "every 9999 days" inputs flooding
// the future-instances table. Two-digit-friendly for compact form UI.
export const RECURRENCE_INTERVAL_MAX: Record<RecurrenceUnit, number> = {
	day: 365,
	week: 52,
	month: 60,
	year: 10
};

// Pack a (month, day) pair into a single MMDD integer for storage in
// recurrenceAnchorValue when unit='year'. Avoids ordinal-day collisions
// across leap years (Feb 29 = 60 in leap year but Mar 1 in non-leap).
export function packMonthDay(monthIdx: number, day: number): number {
	return (monthIdx + 1) * 100 + day;
}

export function unpackMonthDay(packed: number): { monthIdx: number; day: number } {
	return { monthIdx: Math.floor(packed / 100) - 1, day: packed % 100 };
}

export type ReminderRecurrence = {
	isRecurring: boolean;
	recurrenceUnit: RecurrenceUnit | null;
	recurrenceInterval: number | null;
	recurrenceAnchor: RecurrenceAnchor | null;
	recurrenceAnchorValue: number | null;
};

/**
 * Render a recurrence description for UI. `variant: 'short'` is the compact
 * list-badge form (`Every 2w`, `Monthly`); `'full'` is the detail-modal form
 * (`Every 2 weeks`, `Every month on day 15`).
 */
export function formatRecurrence(
	r: ReminderRecurrence,
	locale: Locale,
	variant: 'full' | 'short' = 'full'
): string {
	if (!r.isRecurring || !r.recurrenceUnit || !r.recurrenceInterval) return '';

	const unit: RecurrenceUnit = r.recurrenceUnit;
	const interval = r.recurrenceInterval;

	if (variant === 'short') {
		const key =
			unit === 'day'
				? 'page.reminders.badgeEveryDays'
				: unit === 'week'
					? 'page.reminders.badgeEveryWeeks'
					: unit === 'month'
						? 'page.reminders.badgeEveryMonths'
						: 'page.reminders.badgeEveryYears';
		return t(locale, key, { count: interval });
	}

	// Full variant — branch on unit + anchor.
	if (unit === 'day') {
		return interval === 1
			? t(locale, 'page.reminders.detailEveryDay')
			: t(locale, 'page.reminders.detailEveryDays', { count: interval });
	}
	if (unit === 'week') {
		return interval === 1
			? t(locale, 'page.reminders.detailEveryWeek')
			: t(locale, 'page.reminders.detailEveryWeeks', { count: interval });
	}
	if (unit === 'month') {
		if (r.recurrenceAnchor === 'day_of_month' && r.recurrenceAnchorValue) {
			return t(locale, 'page.reminders.detailEveryMonthsOnDay', {
				count: interval,
				day: r.recurrenceAnchorValue
			});
		}
		return interval === 1
			? t(locale, 'page.reminders.detailEveryMonth')
			: t(locale, 'page.reminders.detailEveryMonths', { count: interval });
	}
	// year
	if (r.recurrenceAnchor === 'day_of_year' && r.recurrenceAnchorValue) {
		const { monthIdx, day } = unpackMonthDay(r.recurrenceAnchorValue);
		const date = new Date(2001, monthIdx, day);
		const formatted = date.toLocaleDateString(locale, { month: 'long', day: 'numeric' });
		return t(locale, 'page.reminders.detailEveryYearsOn', { count: interval, date: formatted });
	}
	return interval === 1
		? t(locale, 'page.reminders.detailEveryYear')
		: t(locale, 'page.reminders.detailEveryYears', { count: interval });
}

/**
 * Return the last valid day of a calendar month (handles leap years).
 */
export function daysInMonth(year: number, monthIdx: number): number {
	return new Date(year, monthIdx + 1, 0).getDate();
}

/**
 * Clamp a desired day-of-month to the last valid day in the target month.
 * Used when advancing month/year-anchored reminders past short months
 * (e.g. Jan 31 + 1 month → Feb 28/29; Feb 29 + 1 year in non-leap → Feb 28).
 */
export function clampDayOfMonth(year: number, monthIdx: number, desiredDay: number): number {
	return Math.min(desiredDay, daysInMonth(year, monthIdx));
}
