import { error, json } from '@sveltejs/kit';
import { and, eq, gte, lt } from 'drizzle-orm';
import { t } from '$lib/i18n';
import { db, schema } from '$lib/server/db';
import { apiRoute, apiRouteJson } from '$lib/server/auth/api-request';
import { withIdempotency } from '$lib/server/api-idempotency';
import { throwCareError } from '$lib/server/care-errors';
import { logDailyEvent } from '$lib/server/daily-events';
import { listAllowedCompanions } from '$lib/server/companion-scope';
import { toApiDailyEvent } from '$lib/server/api-serializers';
import {
	isJsonObject,
	isValidDate,
	parseCompanionTargets,
	parseDailyEventType,
	parseDurationMinutes,
	parseLoggedAt,
	exceedsLen
} from '$lib/server/validation';
import { MAX_NOTE_LEN } from '$lib/server/env';

// Read-back: GET /api/logs?companionId=&date=YYYY-MM-DD (date optional). Returns
// the token user's readable daily events for that companion, newest first.
export const GET = apiRoute(async ({ event, user, locale }) => {
	const companionId = event.url.searchParams.get('companionId');
	if (!companionId) {
		error(400, { code: 'noCompanions', message: t(locale, 'error.noCompanionsSelected') });
	}
	const allowed = await listAllowedCompanions({ id: user.id, role: user.role });
	if (!allowed.includes(companionId)) throwCareError('notAssigned', locale);

	const dateParam = event.url.searchParams.get('date');
	const filters = [eq(schema.dailyEvents.companionId, companionId)];
	if (dateParam) {
		if (!isValidDate(dateParam)) {
			error(400, { code: 'invalidDate', message: t(locale, 'error.invalidDate') });
		}
		const start = new Date(`${dateParam}T00:00:00`);
		const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
		filters.push(gte(schema.dailyEvents.loggedAt, start), lt(schema.dailyEvents.loggedAt, end));
	}
	const rows = await db.query.dailyEvents.findMany({
		where: and(...filters),
		orderBy: (d, { desc }) => [desc(d.loggedAt)],
		limit: 200
	});
	return json({ events: rows.map(toApiDailyEvent) });
});

// Bearer-token endpoint (never reads locals.user): create one or more daily
// events headlessly. Body: { companionIds|companionId, type, notes?,
// durationMinutes?, loggedAt? (ISO) }. The token acts as its user, so caretaker
// tokens keep the shift + assignment rules.
export const POST = apiRouteJson(isJsonObject, async ({ event, user, tokenId, locale, body }) => {
	const type = parseDailyEventType(String(body.type ?? ''));
	if (!type) error(400, { code: 'invalidType', message: t(locale, 'error.typeRequired') });

	const companionIds = parseCompanionTargets(body);
	if (companionIds.length === 0) {
		error(400, { code: 'noCompanions', message: t(locale, 'error.noCompanionsSelected') });
	}

	if (exceedsLen(body.notes, MAX_NOTE_LEN)) {
		error(400, {
			code: 'noteTooLong',
			message: t(locale, 'error.noteTooLong', { max: MAX_NOTE_LEN })
		});
	}

	return withIdempotency({ request: event.request, tokenId, endpoint: 'logs', body }, async () => {
		const result = await logDailyEvent({ id: user.id, role: user.role }, companionIds, {
			type,
			notes: typeof body.notes === 'string' ? body.notes.trim() || null : null,
			durationMinutes: parseDurationMinutes(body.durationMinutes),
			loggedAt: parseLoggedAt(body.loggedAt) ?? new Date()
		});
		if (!result.ok) throwCareError(result.code, locale);
		return { status: 201, data: { ids: result.ids, eventGroupId: result.eventGroupId } };
	});
});
