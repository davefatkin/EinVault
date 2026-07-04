import { error, json } from '@sveltejs/kit';
import { and, eq, gte, lt } from 'drizzle-orm';
import { t } from '$lib/i18n';
import { db, schema } from '$lib/server/db';
import { apiRoute, apiRouteZod } from '$lib/server/auth/api-request';
import { withIdempotency } from '$lib/server/api-idempotency';
import { throwCareError } from '$lib/server/care-errors';
import { authorizeCompanions } from '$lib/server/companion-scope';
import { requireFullScope, requireAllowedCompanion } from '$lib/server/api-guards';
import { createHealthEvent } from '$lib/server/health';
import { toApiHealthEvent } from '$lib/server/api-serializers';
import { isValidDate, parseRecordTimestamp } from '$lib/server/validation';
import { HealthRequest } from '$lib/server/openapi/schemas';
import { MAX_NOTE_LEN } from '$lib/server/env';
import { paginate } from '$lib/server/pagination';

// GET /api/health-events?companionId=&date=YYYY-MM-DD (date optional). Full-scope only.
export const GET = apiRoute(async ({ event, user, scope, locale }) => {
	requireFullScope(scope, locale);
	const companionId = await requireAllowedCompanion(event.url, user, locale);

	const filters = [eq(schema.healthEvents.companionId, companionId)];
	const dateParam = event.url.searchParams.get('date');
	if (dateParam) {
		if (!isValidDate(dateParam))
			error(400, { code: 'invalidDate', message: t(locale, 'error.invalidDate') });
		const start = new Date(`${dateParam}T00:00:00`);
		const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
		filters.push(
			gte(schema.healthEvents.occurredAt, start),
			lt(schema.healthEvents.occurredAt, end)
		);
	}
	const { page, hasMore } = await paginate(event.url, locale, (take, offset) =>
		db.query.healthEvents.findMany({
			where: and(...filters),
			orderBy: (h, { desc }) => [desc(h.occurredAt)],
			limit: take,
			offset
		})
	);
	return json({ events: page.map(toApiHealthEvent), hasMore });
});

// POST /api/health-events: create one health event. Token acts as its user, so
// caretaker shift/assignment rules apply via authorizeCompanions.
export const POST = apiRouteZod(
	HealthRequest,
	async ({ event, user, tokenId, locale, body }) => {
		return withIdempotency(
			{ request: event.request, tokenId, endpoint: 'health', body },
			async () => {
				// Auth + timestamp parse run INSIDE the idempotency callback so a keyed
				// retry replays the cached response instead of re-checking shift state
				// (which may have changed, e.g. the caretaker's shift ended since the
				// original request).
				const resolved = await authorizeCompanions({ id: user.id, role: user.role }, [
					body.companionId
				]);
				if (!resolved.ok) throwCareError(resolved.code, locale);

				let occurredAt = new Date();
				if (body.occurredAt !== undefined) {
					const parsed = parseRecordTimestamp(body.occurredAt);
					if (!parsed)
						error(400, {
							code: 'invalidOccurredAt',
							message: t(locale, 'error.invalidOccurredAt')
						});
					occurredAt = parsed;
				}

				const id = await createHealthEvent(
					body.companionId,
					{
						type: body.type,
						title: body.title.trim(),
						notes: body.notes?.trim() || null,
						occurredAt,
						vetName: body.vetName?.trim() || null,
						vetClinic: body.vetClinic?.trim() || null
					},
					user.id
				);
				return { status: 201, data: { id, companionId: body.companionId } };
			}
		);
	},
	(issue, locale) => {
		if (issue.path[0] === 'type')
			return { code: 'invalidType', message: t(locale, 'error.typeRequired') };
		if (issue.path[0] === 'title' && issue.code !== 'too_big')
			return { code: 'titleRequired', message: t(locale, 'error.titleRequired') };
		if (issue.path[0] === 'notes' && issue.code === 'too_big')
			return {
				code: 'noteTooLong',
				message: t(locale, 'error.noteTooLong', { max: MAX_NOTE_LEN })
			};
		return undefined;
	}
);
