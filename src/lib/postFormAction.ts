import type { ActionResult } from '@sveltejs/kit';

export type PostFormActionOutcome = 'saved' | 'signedOut' | 'failed';

/**
 * POST a form action from code (autosave) the way `use:enhance` does and
 * report what happened. Without `accept: application/json` SvelteKit answers
 * with HTML: a signed-out post redirects to the login page, fetch follows it,
 * and the 200 looks like a successful save. With it, the action returns an
 * ActionResult, where a `fail()` still arrives as HTTP 200, so the result
 * type is what decides success.
 */
export async function postFormAction(
	action: string,
	body: FormData
): Promise<PostFormActionOutcome> {
	let res: Response;
	try {
		res = await fetch(action, {
			method: 'POST',
			body,
			headers: { accept: 'application/json', 'x-sveltekit-action': 'true' }
		});
	} catch {
		return 'failed';
	}
	// Only the envelope's type and status matter here, so skip `deserialize`
	// and leave the devalue-encoded `data` unparsed.
	let result: ActionResult;
	try {
		result = JSON.parse(await res.text());
	} catch {
		// Not an ActionResult (e.g. an HTML page from a redirect).
		return 'failed';
	}
	if (result.type === 'success') return 'saved';
	// The owner route guard answers 401 with an `error` result; actions outside
	// it return fail(401), which arrives as HTTP 200 with the status in the body.
	if (res.status === 401 || (result.type === 'failure' && result.status === 401)) {
		return 'signedOut';
	}
	return 'failed';
}
