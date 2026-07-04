import { error, json } from '@sveltejs/kit';
import { and, eq, gte, lt } from 'drizzle-orm';
import { t } from '$lib/i18n';
import { db, schema } from '$lib/server/db';
import { apiRoute, apiRouteZod } from '$lib/server/auth/api-request';
import { withIdempotency } from '$lib/server/api-idempotency';
import { throwCareError } from '$lib/server/care-errors';
import { authorizeCompanions, listAllowedCompanions } from '$lib/server/companion-scope';
import { createHealthEvent } from '$lib/server/health';
import { toApiHealthEvent } from '$lib/server/api-serializers';
import { isValidDate, parseRecordTimestamp } from '$lib/server/validation';
import { HealthRequest } from '$lib/server/openapi/schemas';
import { MAX_NOTE_LEN } from '$lib/server/env';
import { parsePagination } from '$lib/server/pagination';

// GET /api/health-events?companionId=&date=YYYY-MM-DD (date optional). Full-scope only.
export const GET = apiRoute(async ({ event, user, scope, locale }) => {
	if (scope === 'write')
		error(403, { code: 'writeScopeReadOnly', message: t(locale, 'error.forbidden') });
	const companionId = event.url.searchParams.get('companionId');
	if (!companionId)
		error(400, { code: 'noCompanions', message: t(locale, 'error.noCompanionsSelected') });
	const allowed = await listAllowedCompanions({ id: user.id, role: user.role });
	if (!allowed.includes(companionId)) throwCareError('notAssigned', locale);

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
	const { limit, offset } = parsePagination(event.url, locale);
	const rows = await db.query.healthEvents.findMany({
		where: and(...filters),
		orderBy: (h, { desc }) => [desc(h.occurredAt)],
		limit: limit + 1,
		offset
	});
	const hasMore = rows.length > limit;
	const page = hasMore ? rows.slice(0, limit) : rows;
	return json({ events: page.map(toApiHealthEvent), hasMore });
});

// POST /api/health-events: create one health event. Token acts as its user, so
// caretaker shift/assignment rules apply via authorizeCompanions.
export const POST = apiRouteZod(
	HealthRequest,
	async ({ event, user, tokenId, locale, body }) => {
		const resolved = await authorizeCompanions({ id: user.id, role: user.role }, [
			body.companionId
		]);
		if (!resolved.ok) throwCareError(resolved.code, locale);

		let occurredAt = new Date();
		if (body.occurredAt !== undefined) {
			const parsed = parseRecordTimestamp(body.occurredAt);
			if (!parsed)
				error(400, { code: 'invalidOccurredAt', message: t(locale, 'error.invalidOccurredAt') });
			occurredAt = parsed;
		}

		return withIdempotency(
			{ request: event.request, tokenId, endpoint: 'health', body },
			async () => {
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
