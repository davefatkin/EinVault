import { error } from '@sveltejs/kit';
import { t } from '#lib/i18n/index.js';
import { apiRoute, apiRouteZod } from '#lib/server/auth/api-request.js';
import { requireNoteOwnerScope } from '#lib/server/notes-api.js';
import {
	incidentUpdateCodeFor,
	loadAllowedIncident,
	throwUpdateNotFound
} from '#lib/server/incidents-api.js';
import {
	deleteIncidentUpdate,
	editIncidentUpdate,
	getIncidentUpdate
} from '#lib/server/incidents.js';
import { toApiIncidentUpdate } from '#lib/server/api-serializers.js';
import { IncidentUpdatePatch } from '#lib/server/openapi/schemas.js';
import { parseRecordTimestamp } from '#lib/server/validation.js';

// PATCH: partial update. Naturally idempotent. Omitted fields keep their value;
// severity null clears it.
export const PATCH = apiRouteZod(
	IncidentUpdatePatch,
	async ({ event, user, scope, locale, body }) => {
		requireNoteOwnerScope(scope, user, locale);
		const incident = await loadAllowedIncident(event.params.id!, user, locale);
		const existing = await getIncidentUpdate(incident.id, event.params.updateId!);
		if (!existing) throwUpdateNotFound(locale);

		let text = existing.body;
		if (body.body !== undefined) {
			text = body.body.trim();
			if (!text) error(400, t(locale, 'error.updateBodyRequired'), { code: 'bodyRequired' });
		}
		let occurredAt: Date | undefined;
		if (body.occurredAt !== undefined) {
			const parsed = parseRecordTimestamp(body.occurredAt);
			if (!parsed) error(400, t(locale, 'error.invalidOccurredAt'), { code: 'invalidOccurredAt' });
			occurredAt = parsed;
		}
		const saved = await editIncidentUpdate(incident.id, existing.id, {
			body: text,
			severity: body.severity === undefined ? existing.severity : body.severity,
			occurredAt
		});
		const updated = saved ? await getIncidentUpdate(incident.id, existing.id) : undefined;
		if (!updated) throwUpdateNotFound(locale);
		return Response.json(toApiIncidentUpdate(updated));
	},
	incidentUpdateCodeFor
);

// DELETE is not idempotent: a retry after a lost response gets 404.
export const DELETE = apiRoute(async ({ event, user, scope, locale }) => {
	requireNoteOwnerScope(scope, user, locale);
	const incident = await loadAllowedIncident(event.params.id!, user, locale);
	if ((await deleteIncidentUpdate(incident.id, event.params.updateId!)) !== 'deleted') {
		throwUpdateNotFound(locale);
	}
	return new Response(null, { status: 204 });
});
