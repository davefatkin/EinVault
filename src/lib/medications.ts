import type { UserRef } from '#lib/types.js';
import {
	formatRecurrence,
	type RecurrenceAnchor,
	type RecurrenceUnit
} from '#lib/reminderRecurrence.js';
import { t, type Locale } from '#lib/i18n/index.js';
import { formatLocalTime } from '#lib/components/localTime.js';

/** Active while `endedOn` is null or on/after `today` (both local YYYY-MM-DD). */
export function isMedicationActive(endedOn: string | null, today: string): boolean {
	return endedOn === null || endedOn >= today;
}

/**
 * Which end-date label a medication gets: ending later ("Ends {date}"), on
 * its last day ("Ends today", still active), or over ("Ended {date}").
 */
export function medicationEndState(
	medication: { active: boolean; endedOn: string | null },
	today: string
): 'endsOn' | 'endsToday' | 'endedOn' | null {
	if (!medication.endedOn) return null;
	if (!medication.active) return 'endedOn';
	return medication.endedOn === today ? 'endsToday' : 'endsOn';
}

/** Today's YYYY-MM-DD in the household time zone (or the runtime zone). */
export function todayInZone(timeZone?: string, now: Date = new Date()): string {
	const parts = new Intl.DateTimeFormat('en-US', {
		year: 'numeric',
		month: '2-digit',
		day: '2-digit',
		...(timeZone ? { timeZone } : {})
	}).formatToParts(now);
	const part = (type: string) => parts.find((p) => p.type === type)?.value ?? '';
	return `${part('year')}-${part('month')}-${part('day')}`;
}

export type MedicationScheduleItem = {
	unit: RecurrenceUnit;
	interval: number;
	anchor: RecurrenceAnchor;
	anchorValue: number | null;
	dueAt: Date;
};

export type MedicationSummary = {
	id: string;
	companionId: string;
	name: string;
	dose: string | null;
	instructions: string | null;
	startedOn: string;
	endedOn: string | null;
	active: boolean;
	nextDueAt: Date | null;
	lastGiven: { at: Date; by: UserRef } | null;
	schedule: MedicationScheduleItem[];
};

export type DoseView = {
	id: string;
	givenAt: Date;
	givenBy: UserRef;
	source: 'reminder' | 'manual';
	note: string | null;
};

/** What the add/edit form shows, and what a failed save sends back. */
export type MedicationFormValues = {
	name: string;
	dose: string | null;
	instructions: string | null;
	startedOn: string;
	endedOn: string | null;
};

export type MedicationCaps = { canLogDose: boolean; canEdit: boolean };

export function ownerMedicationCaps(companionActive: boolean): MedicationCaps {
	return { canLogDose: companionActive, canEdit: companionActive };
}

/** Caretakers read active medications always; "Given" needs a shift. Never edit. */
export function caretakerMedicationCaps(isOnShift: boolean): MedicationCaps {
	return { canLogDose: isOnShift, canEdit: false };
}

function minutesOfDay(d: Date, timeZone?: string): number {
	const parts = new Intl.DateTimeFormat('en-US', {
		hour: 'numeric',
		minute: 'numeric',
		hourCycle: 'h23',
		...(timeZone ? { timeZone } : {})
	}).formatToParts(d);
	const part = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? 0);
	return part('hour') * 60 + part('minute');
}

/**
 * "Every day at 8:00 AM and 8:00 PM; Every month on day 1 at 9:00 AM": the
 * linked reminder series grouped by recurrence, times in the household zone.
 */
export function formatMedicationSchedule(
	schedule: MedicationScheduleItem[],
	locale: Locale,
	timeZone?: string
): string {
	const groups = new Map<string, Map<number, string>>();
	for (const item of schedule) {
		const recurrence = formatRecurrence(
			{
				isRecurring: true,
				recurrenceUnit: item.unit,
				recurrenceInterval: item.interval,
				recurrenceAnchor: item.anchor,
				recurrenceAnchorValue: item.anchorValue
			},
			locale
		);
		if (!recurrence) continue;
		const due = new Date(item.dueAt);
		const time = formatLocalTime(due, { format: 'time', locale, timeZone })?.display;
		if (!time) continue;
		const times = groups.get(recurrence) ?? new Map<number, string>();
		times.set(minutesOfDay(due, timeZone), time);
		groups.set(recurrence, times);
	}
	const list = new Intl.ListFormat(locale, { type: 'conjunction' });
	return [...groups]
		.map(([recurrence, times]) =>
			t(locale, 'page.medications.scheduleAt', {
				recurrence,
				times: list.format([...times].sort((a, b) => a[0] - b[0]).map(([, s]) => s))
			})
		)
		.join('; ');
}
