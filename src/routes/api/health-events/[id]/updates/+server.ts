import { error } from '@sveltejs/kit';
import { asc, eq } from 'drizzle-orm';
import { t } from '#lib/i18n/index.js';
import { db, schema } from '#lib/server/db/index.js';
import { apiRoute, apiRouteZod } from '#lib/server/auth/api-request.js';
import { withIdempotency } from '#lib/server/api-idempotency.js';
import { requireNoteOwnerScope } from '#lib/server/notes-api.js';
import { incidentUpdateCodeFor, loadAllowedIncident } from '#lib/server/incidents-api.js';
import { createIncidentUpdate } from '#lib/server/incidents.js';
import { toApiIncidentUpdate } from '#lib/server/api-serializers.js';
import { IncidentUpdateRequest } from '#lib/server/openapi/schemas.js';
import { parseRecordTimestamp } from '#lib/server/validation.js';

// GET /api/health-events/{id}/updates: oldest first. Owner tokens only.
export const GET = apiRoute(async ({ event, user, scope, locale }) => {
	requireNoteOwnerScope(scope, user, locale);
	const incident = await loadAllowedIncident(event.params.id!, user, locale);
	const rows = await db
		.select()
		.from(schema.healthEventUpdates)
		.where(eq(schema.healthEventUpdates.healthEventId, incident.id))
		.orderBy(asc(schema.healthEventUpdates.occurredAt), asc(schema.healthEventUpdates.createdAt));
	return Response.json({ updates: rows.map(toApiIncidentUpdate) });
});

export const POST = apiRouteZod(
	IncidentUpdateRequest,
	async ({ event, user, scope, tokenId, locale, body }) => {
		requireNoteOwnerScope(scope, user, locale);
		const incidentId = event.params.id!;
		return withIdempotency(
			{
				request: event.request,
				tokenId,
				endpoint: 'incident-update',
				body: { incidentId, ...body }
			},
			async () => {
				const incident = await loadAllowedIncident(incidentId, user, locale);
				const text = body.body.trim();
				if (!text) error(400, t(locale, 'error.updateBodyRequired'), { code: 'bodyRequired' });
				let occurredAt = new Date();
				if (body.occurredAt !== undefined) {
					const parsed = parseRecordTimestamp(body.occurredAt);
					if (!parsed)
						error(400, t(locale, 'error.invalidOccurredAt'), { code: 'invalidOccurredAt' });
					occurredAt = parsed;
				}
				const id = await createIncidentUpdate(
					incident.id,
					{ body: text, severity: body.severity ?? null, occurredAt },
					user.id
				);
				const row = await db.query.healthEventUpdates.findFirst({
					where: eq(schema.healthEventUpdates.id, id)
				});
				return { status: 201, data: toApiIncidentUpdate(row!) };
			}
		);
	},
	incidentUpdateCodeFor
);
