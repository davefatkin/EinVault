export type GettingStartedPref = 'auto' | 'dismissed' | 'reopened';
export type CardMode = 'hidden' | 'open' | 'allSet';

/**
 * Decides whether the getting started card shows and what to persist.
 * `today` is a YYYY-MM-DD string in the server timezone.
 */
export function resolveCardMode(input: {
	pref: GettingStartedPref;
	seenAt: Date | null;
	completedOn: string | null;
	complete: boolean;
	today: string;
}): { mode: CardMode; patch: { seenAt?: Date; completedOn?: string } } {
	const { pref, seenAt, completedOn, complete, today } = input;

	if (pref === 'dismissed') return { mode: 'hidden', patch: {} };
	if (pref === 'reopened') return { mode: complete ? 'allSet' : 'open', patch: {} };

	if (!complete) {
		if (completedOn) return { mode: 'hidden', patch: {} };
		return { mode: 'open', patch: seenAt ? {} : { seenAt: new Date() } };
	}

	// Complete the first time the card would render: never shown.
	if (!seenAt) return { mode: 'hidden', patch: {} };
	if (!completedOn) return { mode: 'allSet', patch: { completedOn: today } };
	return { mode: completedOn === today ? 'allSet' : 'hidden', patch: {} };
}

export const GETTING_STARTED_STEPS = ['quickLog', 'journal', 'health', 'medication'] as const;
export type GettingStartedStep = (typeof GETTING_STARTED_STEPS)[number];

export interface GettingStartedProgress {
	done: Record<GettingStartedStep, boolean>;
	medication: { supply: boolean; medication: boolean; reminder: boolean; dose: boolean };
	/** Admins only; null for everyone else and not counted toward completion. */
	caretaker: boolean | null;
	doneCount: number;
	complete: boolean;
	needsReminder: { id: string; name: string; companionId: string } | null;
}

export interface GettingStartedView {
	mode: Exclude<CardMode, 'hidden'>;
	progress: GettingStartedProgress;
}

export const MEDICATION_SUBSTEPS = ['supply', 'medication', 'reminder', 'dose'] as const;
export type MedicationSubStep = (typeof MEDICATION_SUBSTEPS)[number];

/** Something the card links to: a step, or one of step 4's sub-steps. */
export type GettingStartedTarget = Exclude<GettingStartedStep, 'medication'> | MedicationSubStep;

/** The first open step, and for step 4 its first open sub-step. Null when all are done. */
export function currentStep(
	progress: GettingStartedProgress
): { step: GettingStartedStep; target: GettingStartedTarget } | null {
	const step = GETTING_STARTED_STEPS.find((s) => !progress.done[s]);
	if (!step) return null;
	return { step, target: stepTarget(progress, step) };
}

/** What a step links to: itself, or for step 4 its first open sub-step. */
export function stepTarget(
	progress: GettingStartedProgress,
	step: GettingStartedStep
): GettingStartedTarget {
	if (step !== 'medication') return step;
	return MEDICATION_SUBSTEPS.find((s) => !progress.medication[s]) ?? 'dose';
}

/**
 * The medication the reminder sub-step names. Only while that sub-step is open:
 * once any dose reminder exists, a second medication without one isn't named.
 */
export function reminderToName(
	progress: GettingStartedProgress
): GettingStartedProgress['needsReminder'] {
	return progress.medication.reminder ? null : progress.needsReminder;
}

/** Where a step is done for one pet. `today` is the server's YYYY-MM-DD. */
export function gettingStartedHref(
	target: GettingStartedTarget,
	companionId: string,
	today: string
): string {
	switch (target) {
		case 'quickLog':
			return `/${companionId}/log`;
		case 'journal':
			return `/${companionId}/journal/${today}`;
		case 'health':
			return `/${companionId}/health`;
		case 'supply':
			return `/${companionId}/supplies/new`;
		case 'medication':
		case 'reminder':
			return `/${companionId}/medications`;
		case 'dose':
			return `/${companionId}/reminders`;
	}
}

/** The medication that has a counted supply but no dose reminder yet. */
export function namedReminderHref(
	needsReminder: NonNullable<GettingStartedProgress['needsReminder']>
): string {
	return `/${needsReminder.companionId}/medications/${needsReminder.id}`;
}
