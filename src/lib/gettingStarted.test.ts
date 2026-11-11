import { describe, expect, it } from 'vitest';
import { resolveCardMode, type GettingStartedPref } from './gettingStarted.js';

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

	it('never shows to users who were already complete', () => {
		expect(run('auto', true)).toEqual({ mode: 'hidden', patch: {} });
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
