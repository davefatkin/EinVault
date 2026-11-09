import type { UserRef } from '#lib/types.js';
import type { RecurrenceAnchor, RecurrenceUnit } from '#lib/reminderRecurrence.js';

/** Active while `endedOn` is null or on/after `today` (both local YYYY-MM-DD). */
export function isMedicationActive(endedOn: string | null, today: string): boolean {
	return endedOn === null || endedOn >= today;
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

export type MedicationCaps = { canLogDose: boolean; canEdit: boolean };
