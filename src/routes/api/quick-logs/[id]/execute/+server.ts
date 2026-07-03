import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { requireApiToken } from '$lib/server/auth/api-request';
import { throwCareError } from '$lib/server/care-errors';
import { executeQuickLog } from '$lib/server/quick-logs';
import { parseIdArray, parseLoggedAt } from '$lib/server/validation';

// Bearer-token endpoint: run one of the token user's configured quick logs.
// Body optional: { companionIds?, loggedAt? }. With no body the remembered/
// assigned target set is used, so a physical button only stores URL + token
// and all configuration lives in the app. API execution never rewrites the
// remembered UI preference.
export const POST: RequestHandler = async (event) => {
	const { user } = await requireApiToken(event);
	const locale = event.locals.locale;

	const body = await event.request.json().catch(() => null);
	const companionIds = body ? parseIdArray(body.companionIds) : [];

	const result = await executeQuickLog({
		user: { id: user.id, role: user.role },
		quickLogId: event.params.id,
		companionIds: companionIds.length > 0 ? companionIds : undefined,
		loggedAt: body ? (parseLoggedAt(body.loggedAt) ?? undefined) : undefined
	});

	// Not-owned reads as notFound (404) so token holders can't probe other users' ids.
	if (!result.ok) throwCareError(result.code, locale);

	return json({ ids: result.ids });
};
