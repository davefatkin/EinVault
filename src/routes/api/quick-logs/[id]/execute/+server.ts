import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { t } from '$lib/i18n';
import { requireApiToken } from '$lib/server/auth/api-request';
import { executeQuickLog } from '$lib/server/quick-logs';
import { parseIdArray, parseLoggedAt } from '$lib/server/validation';

// Bearer-token endpoint: run one of the token user's configured quick logs.
// Body optional: { companionIds?, loggedAt? } — with no body the remembered/
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

	if (!result.ok) {
		// Not-owned reads as not-found so token holders can't probe other users' ids.
		if (result.code === 'notFound') error(404, t(locale, 'error.quickLogNotFound'));
		if (result.code === 'disabled') error(403, t(locale, 'error.quickLogDisabled'));
		if (result.code === 'noActiveShift') error(403, t(locale, 'error.noActiveShift'));
		if (result.code === 'notAssigned') error(403, t(locale, 'error.notAssignedToCompanion'));
		error(404, t(locale, 'error.companionNotFound'));
	}

	return json({ ids: result.ids });
};
