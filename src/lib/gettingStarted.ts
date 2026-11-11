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
