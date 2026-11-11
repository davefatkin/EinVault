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
