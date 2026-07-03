import { json, error } from '@sveltejs/kit';
import { t } from '$lib/i18n';
import { apiRouteJson } from '$lib/server/auth/api-request';
import { throwCareError } from '$lib/server/care-errors';
import { logDailyEvent } from '$lib/server/daily-events';
import {
	isJsonObject,
	parseCompanionTargets,
	parseDailyEventType,
	parseDurationMinutes,
	parseLoggedAt
} from '$lib/server/validation';

// Bearer-token endpoint (never reads locals.user): create one or more daily
// events headlessly. Body: { companionIds|companionId, type, notes?,
// durationMinutes?, loggedAt? (ISO) }. The token acts as its user, so caretaker
// tokens keep the shift + assignment rules.
export const POST = apiRouteJson(isJsonObject, async ({ user, locale, body }) => {
	const type = parseDailyEventType(String(body.type ?? ''));
	if (!type) error(400, { code: 'invalidType', message: t(locale, 'error.typeRequired') });

	const companionIds = parseCompanionTargets(body);
	if (companionIds.length === 0) {
		error(400, { code: 'noCompanions', message: t(locale, 'error.noCompanionsSelected') });
	}

	const result = await logDailyEvent({ id: user.id, role: user.role }, companionIds, {
		type,
		notes: typeof body.notes === 'string' ? body.notes.trim() || null : null,
		durationMinutes: parseDurationMinutes(body.durationMinutes),
		loggedAt: parseLoggedAt(body.loggedAt) ?? new Date()
	});

	if (!result.ok) throwCareError(result.code, locale);

	return json({ ids: result.ids, eventGroupId: result.eventGroupId }, { status: 201 });
});
