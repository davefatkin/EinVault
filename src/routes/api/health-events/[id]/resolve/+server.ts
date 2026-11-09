import { error } from '@sveltejs/kit';
import { t } from '#lib/i18n/index.js';
import { apiRouteZod } from '#lib/server/auth/api-request.js';
import { withIdempotency } from '#lib/server/api-idempotency.js';
import { requireNoteOwnerScope } from '#lib/server/notes-api.js';
import { loadAllowedIncident, throwIncidentNotFound } from '#lib/server/incidents-api.js';
import { getIncident, setIncidentResolved } from '#lib/server/incidents.js';
import { toApiHealthEvent } from '#lib/server/api-serializers.js';
import { IncidentResolveRequest } from '#lib/server/openapi/schemas.js';
import { parseRecordTimestamp } from '#lib/server/validation.js';

// POST { resolvedAt?: string | null }: omit for now, null reopens.
export const POST = apiRouteZod(
	IncidentResolveRequest,
	async ({ event, user, scope, tokenId, locale, body }) => {
		requireNoteOwnerScope(scope, user, locale);
		const incidentId = event.params.id!;
		return withIdempotency(
			{
				request: event.request,
				tokenId,
				endpoint: 'incident-resolve',
				body: { incidentId, ...body }
			},
			async () => {
				const incident = await loadAllowedIncident(incidentId, user, locale);
				let resolvedAt: Date | null = new Date();
				if (body.resolvedAt === null) resolvedAt = null;
				else if (body.resolvedAt !== undefined) {
					resolvedAt = parseRecordTimestamp(body.resolvedAt);
					if (!resolvedAt)
						error(400, t(locale, 'error.invalidOccurredAt'), { code: 'invalidOccurredAt' });
				}
				const saved = await setIncidentResolved(incident.companionId, incident.id, resolvedAt);
				const updated = saved ? await getIncident(incident.companionId, incident.id) : undefined;
				if (!updated) throwIncidentNotFound(locale);
				return { status: 200, data: toApiHealthEvent(updated) };
			}
		);
	}
);
