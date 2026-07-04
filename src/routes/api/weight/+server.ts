import { error, json } from '@sveltejs/kit';
import { and, eq } from 'drizzle-orm';
import { t } from '$lib/i18n';
import { db, schema } from '$lib/server/db';
import { apiRoute, apiRouteZod } from '$lib/server/auth/api-request';
import { withIdempotency } from '$lib/server/api-idempotency';
import { throwCareError } from '$lib/server/care-errors';
import { authorizeCompanions, listAllowedCompanions } from '$lib/server/companion-scope';
import { createWeightEntry } from '$lib/server/weight';
import { toApiWeightEntry } from '$lib/server/api-serializers';
import { parseRecordTimestamp } from '$lib/server/validation';
import { WeightRequest } from '$lib/server/openapi/schemas';
import { MAX_NOTE_LEN } from '$lib/server/env';

// GET /api/weight?companionId=. Full-scope only.
export const GET = apiRoute(async ({ event, user, scope, locale }) => {
	if (scope === 'write')
		error(403, { code: 'writeScopeReadOnly', message: t(locale, 'error.forbidden') });
	const companionId = event.url.searchParams.get('companionId');
	if (!companionId)
		error(400, { code: 'noCompanions', message: t(locale, 'error.noCompanionsSelected') });
	const allowed = await listAllowedCompanions({ id: user.id, role: user.role });
	if (!allowed.includes(companionId)) throwCareError('notAssigned', locale);

	const rows = await db.query.weightEntries.findMany({
		where: and(eq(schema.weightEntries.companionId, companionId)),
		orderBy: (w, { desc }) => [desc(w.recordedAt)],
		limit: 200
	});
	return json({ entries: rows.map(toApiWeightEntry) });
});

// POST /api/weight: create one weight entry. Token acts as its user, so
// caretaker shift/assignment rules apply via authorizeCompanions.
export const POST = apiRouteZod(
	WeightRequest,
	async ({ event, user, tokenId, locale, body }) => {
		const resolved = await authorizeCompanions({ id: user.id, role: user.role }, [
			body.companionId
		]);
		if (!resolved.ok) throwCareError(resolved.code, locale);

		let recordedAt = new Date();
		if (body.recordedAt !== undefined) {
			const parsed = parseRecordTimestamp(body.recordedAt);
			if (!parsed)
				error(400, { code: 'invalidRecordedAt', message: t(locale, 'error.invalidRecordedAt') });
			recordedAt = parsed;
		}

		return withIdempotency(
			{ request: event.request, tokenId, endpoint: 'weight', body },
			async () => {
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
