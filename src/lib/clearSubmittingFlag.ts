import type { SubmitFunction } from '@sveltejs/kit';
import { addToast } from '$lib/components/ui/toast';

const FAILURE_TOAST_MS = 6000;

/**
 * `use:enhance` callback for forms whose submit path goes through
 * `$lib/pendingDismiss.safeSubmit`. `safeSubmit` sets
 * `form.dataset.submitting = '1'` to block double-submits while the request
 * is in flight. The flag is normally cleared by the form unmounting on the
 * 303 redirect that follows a successful action, but if the server returns
 * a `fail()` (e.g. concurrent completion in another tab) the form stays
 * mounted and the flag would lock further submits forever. This callback
 * clears it whenever the result is anything other than a redirect.
 *
 * A `fail()` also surfaces its message as a toast: the dismiss toast already
 * announced success, and these hidden forms have no inline error slot, so a
 * refused dose (no pills left) would otherwise look like it went through.
 */
export const clearSubmittingFlag: SubmitFunction = ({ formElement }) => {
	return async ({ update, result }) => {
		await update();
		if (result.type !== 'redirect') {
			delete formElement.dataset.submitting;
		}
		if (result.type === 'failure' && typeof result.data?.error === 'string') {
			addToast({ title: result.data.error, durationMs: FAILURE_TOAST_MS });
		}
	};
};
