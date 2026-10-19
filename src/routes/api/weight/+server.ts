import { error, json } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';
import { t } from '#lib/i18n/index.js';
import { db, schema } from '#lib/server/db/index.js';
import { apiRoute, apiRouteZod } from '#lib/server/auth/api-request.js';
import { withIdempotency } from '#lib/server/api-idempotency.js';
import { throwCareError } from '#lib/server/care-errors.js';
import { authorizeCompanions } from '#lib/server/companion-scope.js';
import { requireFullScope, requireAllowedCompanion } from '#lib/server/api-guards.js';
import { createWeightEntry } from '#lib/server/weight.js';
import { toApiWeightEntry } from '#lib/server/api-serializers.js';
import { parseRecordTimestamp } from '#lib/server/validation.js';
import { WeightRequest } from '#lib/server/openapi/schemas.js';
import { MAX_NOTE_LEN } from '#lib/server/env.js';
import { paginate } from '#lib/server/pagination.js';

// GET /api/weight?companionId=. Full-scope only.
export const GET = apiRoute(async ({ event, user, scope, locale }) => {
	requireFullScope(scope, locale);
	const companionId = await requireAllowedCompanion(event.url, user, locale);

	const { page, hasMore } = await paginate(event.url, locale, (take, offset) =>
		db.query.weightEntries.findMany({
			where: eq(schema.weightEntries.companionId, companionId),
			orderBy: (w, { desc }) => [desc(w.recordedAt)],
			limit: take,
			offset
		})
	);
	return json({ entries: page.map(toApiWeightEntry), hasMore });
});

// POST /api/weight: create one weight entry. Token acts as its user, so
// caretaker shift/assignment rules apply via authorizeCompanions.
export const POST = apiRouteZod(
	WeightRequest,
	async ({ event, user, tokenId, locale, body }) => {
		return withIdempotency(
			{ request: event.request, tokenId, endpoint: 'weight', body },
			async () => {
				// Auth + timestamp parse run INSIDE the idempotency callback so a keyed
				// retry replays the cached response instead of re-checking shift state
				// (which may have changed, e.g. the caretaker's shift ended since the
				// original request).
				const resolved = await authorizeCompanions({ id: user.id, role: user.role }, [
					body.companionId
				]);
				if (!resolved.ok) throwCareError(resolved.code, locale);

				let recordedAt = new Date();
				if (body.recordedAt !== undefined) {
					const parsed = parseRecordTimestamp(body.recordedAt);
					if (!parsed)
						error(400, {
							code: 'invalidRecordedAt',
							message: t(locale, 'error.invalidRecordedAt')
						});
					recordedAt = parsed;
				}

				const id = await createWeightEntry(
					body.companionId,
					{
						weight: body.weight,
						unit: body.unit,
						notes: body.notes?.trim() || null,
						recordedAt
					},
					user.id
				);
				return { status: 201, data: { id, companionId: body.companionId } };
			}
		);
	},
	(issue, locale) => {
		if (issue.path[0] === 'weight')
			return { code: 'invalidWeight', message: t(locale, 'error.invalidWeight') };
		if (issue.path[0] === 'unit')
			return { code: 'invalidUnit', message: t(locale, 'error.invalidUnit') };
		if (issue.path[0] === 'notes' && issue.code === 'too_big')
			return {
				code: 'noteTooLong',
				message: t(locale, 'error.noteTooLong', { max: MAX_NOTE_LEN })
			};
		return undefined;
	}
);
