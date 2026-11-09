import { error } from '@sveltejs/kit';
import { t } from '#lib/i18n/index.js';
import { apiRoute, apiRouteZod } from '#lib/server/auth/api-request.js';
import { withIdempotency } from '#lib/server/api-idempotency.js';
import { requireNoteOwnerScope } from '#lib/server/notes-api.js';
import { loadAllowedIncident } from '#lib/server/incidents-api.js';
import {
	linkToIncident,
	listLinkedEvents,
	unlinkFromIncident
} from '#lib/server/incident-links.js';
import { toApiIncidentLink } from '#lib/server/api-serializers.js';
import { IncidentLinkRequest } from '#lib/server/openapi/schemas.js';

export const GET = apiRoute(async ({ event, user, scope, locale }) => {
	requireNoteOwnerScope(scope, user, locale);
	const incident = await loadAllowedIncident(event.params.id!, user, locale);
	const links = await listLinkedEvents(incident.companionId, incident.id);
	return Response.json({ links: links.map(toApiIncidentLink) });
});

// POST { healthEventId }: link a non-incident health event of the same companion.
export const POST = apiRouteZod(
	IncidentLinkRequest,
	async ({ event, user, scope, tokenId, locale, body }) => {
		requireNoteOwnerScope(scope, user, locale);
		const incidentId = event.params.id!;
		return withIdempotency(
			{ request: event.request, tokenId, endpoint: 'incident-link', body: { incidentId, ...body } },
			async () => {
				const incident = await loadAllowedIncident(incidentId, user, locale);
				const outcome = await linkToIncident(incident.companionId, incident.id, body.healthEventId);
				if (outcome === 'notFound')
					error(404, t(locale, 'error.eventNotFound'), { code: 'notFound' });
				if (outcome === 'invalid')
					error(400, t(locale, 'error.incidentLinkInvalid'), { code: 'invalidLink' });
				return {
					status: 201,
					data: { incidentId: incident.id, healthEventId: body.healthEventId }
				};
			}
		);
	}
);

// DELETE ?healthEventId=: remove one link.
export const DELETE = apiRoute(async ({ event, user, scope, locale }) => {
	requireNoteOwnerScope(scope, user, locale);
	const incident = await loadAllowedIncident(event.params.id!, user, locale);
	const healthEventId = event.url.searchParams.get('healthEventId');
	if (!healthEventId) error(400, t(locale, 'error.invalidRequestBody'), { code: 'invalidBody' });
	if (!(await unlinkFromIncident(incident.companionId, incident.id, healthEventId))) {
		error(404, t(locale, 'error.eventNotFound'), { code: 'notFound' });
	}
	return new Response(null, { status: 204 });
});
