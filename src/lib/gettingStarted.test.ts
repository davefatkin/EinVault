import { describe, expect, it } from 'vitest';
import {
	GETTING_STARTED_STEPS,
	currentStep,
	isStepExpanded,
	gettingStartedHref,
	namedReminderHref,
	reminderToName,
	resolveCardMode,
	skipsProgress,
	type GettingStartedPref,
	type GettingStartedProgress
} from './gettingStarted.js';

const today = '2026-11-10';

function run(
	pref: GettingStartedPref,
	complete: boolean,
	seenAt: Date | null = null,
	completedOn: string | null = null
) {
	return resolveCardMode({ pref, seenAt, completedOn, complete, today });
}

describe('resolveCardMode', () => {
	it('hides when dismissed, complete or not', () => {
		expect(run('dismissed', false)).toEqual({ mode: 'hidden', patch: {} });
		expect(run('dismissed', true)).toEqual({ mode: 'hidden', patch: {} });
	});

	it('shows when reopened in whatever state it is in', () => {
		expect(run('reopened', false)).toEqual({ mode: 'open', patch: {} });
		expect(run('reopened', true)).toEqual({ mode: 'allSet', patch: {} });
	});

	it('opens and records first sight when incomplete', () => {
		const r = run('auto', false);
		expect(r.mode).toBe('open');
		expect(r.patch.seenAt).toBeInstanceOf(Date);
		expect(r.patch.completedOn).toBeUndefined();
	});

	it('opens without a patch once already seen', () => {
		expect(run('auto', false, new Date())).toEqual({ mode: 'open', patch: {} });
	});

	it('never returns on its own after completing', () => {
		expect(run('auto', false, new Date(), '2026-11-01')).toEqual({ mode: 'hidden', patch: {} });
	});

	it('never shows to users who were already complete, and records the day', () => {
		expect(run('auto', true)).toEqual({ mode: 'hidden', patch: { completedOn: today } });
	});

	it('stays hidden for an already-complete user whose data later drops', () => {
		expect(run('auto', false, null, today)).toEqual({ mode: 'hidden', patch: {} });
		expect(run('auto', false, null, '2026-11-01')).toEqual({ mode: 'hidden', patch: {} });
	});

	it('never shows all set to an already-complete user, even on that day', () => {
		expect(run('auto', true, null, today)).toEqual({ mode: 'hidden', patch: {} });
		expect(run('auto', true, null, '2026-11-01')).toEqual({ mode: 'hidden', patch: {} });
	});

	it('shows all set and records the completion day', () => {
		expect(run('auto', true, new Date())).toEqual({
			mode: 'allSet',
			patch: { completedOn: today }
		});
	});

	it('shows all set only on the completion day', () => {
		expect(run('auto', true, new Date(), today)).toEqual({ mode: 'allSet', patch: {} });
		expect(run('auto', true, new Date(), '2026-11-09')).toEqual({ mode: 'hidden', patch: {} });
	});
});

describe('skipsProgress', () => {
	// [pref, seen, completedOn, skips]
	const cases: [GettingStartedPref, boolean, string | null, boolean][] = [
		['dismissed', false, null, true],
		['dismissed', true, today, true],
		['reopened', false, null, false],
		['reopened', true, '2026-11-01', false],
		['auto', false, null, false],
		['auto', true, null, false],
		['auto', true, today, false],
		['auto', true, '2026-11-01', true],
		['auto', false, today, true],
		['auto', false, '2026-11-01', true]
	];
	const seenAt = (seen: boolean) => (seen ? new Date() : null);

	it.each(cases)('pref %s, seen %s, completed %s: skips %s', (pref, seen, completedOn, skips) => {
		expect(skipsProgress({ pref, seenAt: seenAt(seen), completedOn, today })).toBe(skips);
	});

	it('only skips when the card is hidden whatever the progress', () => {
		for (const [pref, seen, completedOn, skips] of cases) {
			if (!skips) continue;
			for (const complete of [true, false]) {
				expect(
					resolveCardMode({ pref, seenAt: seenAt(seen), completedOn, complete, today })
				).toEqual({ mode: 'hidden', patch: {} });
			}
		}
	});
});

function progress(over: Partial<GettingStartedProgress> = {}): GettingStartedProgress {
	return {
		done: { quickLog: false, journal: false, health: false, medication: false },
		medication: { supply: false, medication: false, reminder: false, dose: false },
		caretaker: null,
		doneCount: 0,
		complete: false,
		needsReminder: null,
		...over
	};
}

describe('currentStep', () => {
	it('opens on the first open step', () => {
		expect(currentStep(progress())).toEqual({ step: 'quickLog', target: 'quickLog' });
		const p = progress({
			done: { quickLog: true, journal: false, health: true, medication: false }
		});
		expect(currentStep(p)).toEqual({ step: 'journal', target: 'journal' });
	});

	it('targets the first open medication sub-step', () => {
		const p = progress({
			done: { quickLog: true, journal: true, health: true, medication: false },
			medication: { supply: true, medication: true, reminder: false, dose: false }
		});
		expect(currentStep(p)).toEqual({ step: 'medication', target: 'reminder' });
	});

	it('is null when every counted step is done', () => {
		const p = progress({
			done: { quickLog: true, journal: true, health: true, medication: true }
		});
		expect(currentStep(p)).toBeNull();
	});
});

describe('gettingStartedHref', () => {
	it('sends each step to where it is done for that pet', () => {
		const href = (t: Parameters<typeof gettingStartedHref>[0]) =>
			gettingStartedHref(t, 'pet-1', today);
		expect(href('quickLog')).toBe('/pet-1/log');
		expect(href('journal')).toBe('/pet-1/journal/2026-11-10');
		expect(href('health')).toBe('/pet-1/health');
		expect(href('supply')).toBe('/pet-1/supplies/new');
		expect(href('medication')).toBe('/pet-1/medications');
		expect(href('reminder')).toBe('/pet-1/medications');
		expect(href('dose')).toBe('/pet-1/reminders');
	});
});

describe('namedReminderHref', () => {
	it('links to the medication missing a reminder, on its own pet', () => {
		expect(namedReminderHref({ id: 'med-1', name: 'Apoquel', companionId: 'pet-2' })).toBe(
			'/pet-2/medications/med-1'
		);
	});
});

describe('reminderToName', () => {
	const needsReminder = { id: 'med-1', name: 'Apoquel', companionId: 'pet-2' };

	it('names the medication while the reminder sub-step is open', () => {
		expect(reminderToName(progress({ needsReminder }))).toEqual(needsReminder);
	});

	it('names nothing once any dose reminder exists', () => {
		const p = progress({
			needsReminder,
			medication: { supply: true, medication: true, reminder: true, dose: false }
		});
		expect(reminderToName(p)).toBeNull();
	});
});

describe('isStepExpanded', () => {
	it('expands the first open step only, when step 4 has no sub-ticks', () => {
		const p = progress();
		expect(GETTING_STARTED_STEPS.filter((s) => isStepExpanded(p, s))).toEqual(['quickLog']);
	});

	it('also expands a half-done step 4 while an earlier step is current', () => {
		const p = progress({
			medication: { supply: true, medication: false, reminder: false, dose: false }
		});
		expect(GETTING_STARTED_STEPS.filter((s) => isStepExpanded(p, s))).toEqual([
			'quickLog',
			'medication'
		]);
	});

	it('never expands a done step', () => {
		const p = progress({
			done: { quickLog: true, journal: false, health: false, medication: true },
			medication: { supply: true, medication: true, reminder: true, dose: true }
		});
		expect(GETTING_STARTED_STEPS.filter((s) => isStepExpanded(p, s))).toEqual(['journal']);
	});
});
