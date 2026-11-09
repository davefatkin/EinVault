import { error, json } from '@sveltejs/kit';
import { and, eq, ne } from 'drizzle-orm';
import type { RequestHandler } from './$types';
import { t } from '#lib/i18n/index.js';
import { db, schema } from '#lib/server/db/index.js';
import { listIncidentCandidates } from '#lib/server/incident-links.js';

// Incidents a health event can still be linked to, loaded when the picker
// opens. GET skips the route-group guard, so the role check lives here.
export const GET: RequestHandler = async ({ params, url, locals }) => {
	if (!locals.user) error(401, t(locals.locale, 'error.unauthorized'));
	if (locals.user.role === 'caretaker') error(403, t(locals.locale, 'error.forbidden'));
	const eventId = url.searchParams.get('eventId') ?? '';
	const event = eventId
		? await db.query.healthEvents.findFirst({
				where: and(
					eq(schema.healthEvents.id, eventId),
					eq(schema.healthEvents.companionId, params.companionId),
					ne(schema.healthEvents.type, 'incident')
				),
				columns: { id: true }
			})
		: undefined;
	if (!event) error(404, t(locals.locale, 'error.eventNotFound'));
	return json(await listIncidentCandidates(params.companionId, event.id));
};
