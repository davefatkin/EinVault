import { error, json } from '@sveltejs/kit';
import { and, eq, gte, lt } from 'drizzle-orm';
import { t } from '$lib/i18n';
import { db, schema } from '$lib/server/db';
import { apiRoute, apiRouteZod } from '$lib/server/auth/api-request';
import { withIdempotency } from '$lib/server/api-idempotency';
import { throwCareError } from '$lib/server/care-errors';
import { logDailyEvent } from '$lib/server/daily-events';
import { requireFullScope, requireAllowedCompanion } from '$lib/server/api-guards';
import { toApiDailyEvent } from '$lib/server/api-serializers';
import { isValidDate, parseCompanionTargets, parseLoggedAt } from '$lib/server/validation';
import { LogRequest } from '$lib/server/openapi/schemas';
import { MAX_NOTE_LEN } from '$lib/server/env';
import { paginate } from '$lib/server/pagination';

// Read-back: GET /api/logs?companionId=&date=YYYY-MM-DD (date optional). Returns
// the token user's readable daily events for that companion, newest first.
export const GET = apiRoute(async ({ event, user, scope, locale }) => {
	// Write-only tokens (log-only devices) must not read back event notes.
	requireFullScope(scope, locale);
	const companionId = await requireAllowedCompanion(event.url, user, locale);

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
	const { page, hasMore } = await paginate(event.url, locale, (take, offset) =>
		db.query.dailyEvents.findMany({
			where: and(...filters),
			orderBy: (d, { desc }) => [desc(d.loggedAt)],
			limit: take,
			offset
		})
	);
	return json({ events: page.map(toApiDailyEvent), hasMore });
});

// Bearer-token endpoint (never reads locals.user): create one or more daily
// events headlessly. The LogRequest zod schema validates shape, the type enum,
// and the note-length cap, and drives the OpenAPI spec. The token acts as its
// user, so caretaker tokens keep the shift + assignment rules.
export const POST = apiRouteZod(
	LogRequest,
	async ({ event, user, tokenId, locale, body }) => {
		const companionIds = parseCompanionTargets(body);
		if (companionIds.length === 0) {
			error(400, { code: 'noCompanions', message: t(locale, 'error.noCompanionsSelected') });
		}

		let loggedAt = new Date();
		if (body.loggedAt !== undefined) {
			const parsed = parseLoggedAt(body.loggedAt);
			if (!parsed) {
				error(400, { code: 'invalidLoggedAt', message: t(locale, 'error.invalidLoggedAt') });
			}
			loggedAt = parsed;
		}

		return withIdempotency(
			{ request: event.request, tokenId, endpoint: 'logs', body },
			async () => {
				const result = await logDailyEvent({ id: user.id, role: user.role }, companionIds, {
					type: body.type,
					notes: body.notes?.trim() || null,
					durationMinutes: body.durationMinutes ?? null,
					loggedAt
				});
				if (!result.ok) throwCareError(result.code, locale);
				return { status: 201, data: { ids: result.ids, eventGroupId: result.eventGroupId } };
			}
		);
	},
	(issue, locale) => {
		// Preserve the stable per-field codes devices branch on, instead of the
		// generic invalidBody zod would otherwise produce.
		if (issue.path[0] === 'type') {
			return { code: 'invalidType', message: t(locale, 'error.typeRequired') };
		}
		if (issue.path[0] === 'notes' && issue.code === 'too_big') {
			return {
				code: 'noteTooLong',
				message: t(locale, 'error.noteTooLong', { max: MAX_NOTE_LEN })
			};
		}
		if (issue.path[0] === 'durationMinutes') {
			return { code: 'invalidDuration', message: t(locale, 'error.invalidDuration') };
		}
		return undefined;
	}
);
