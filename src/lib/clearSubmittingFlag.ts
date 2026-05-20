import type { SubmitFunction } from '@sveltejs/kit';

/**
 * `use:enhance` callback for forms whose submit path goes through
 * `$lib/pendingDismiss.safeSubmit`. `safeSubmit` sets
 * `form.dataset.submitting = '1'` to block double-submits while the request
 * is in flight. The flag is normally cleared by the form unmounting on the
 * 303 redirect that follows a successful action, but if the server returns
 * a `fail()` (e.g. concurrent completion in another tab) the form stays
 * mounted and the flag would lock further submits forever. This callback
 * clears it whenever the result is anything other than a redirect.
 */
export const clearSubmittingFlag: SubmitFunction = ({ formElement }) => {
	return async ({ update, result }) => {
		await update();
		if (result.type !== 'redirect') {
			delete formElement.dataset.submitting;
		}
	};
};
