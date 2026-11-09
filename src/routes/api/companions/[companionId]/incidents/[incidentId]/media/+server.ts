import { error, type RequestEvent } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { t } from '#lib/i18n/index.js';
import { incidentMediaUrl } from '#lib/media.js';
import { MAX_INCIDENT_MEDIA } from '#lib/incidents.js';
import { generateId } from '#lib/server/utils.js';
import { assertCanWriteIncident } from '#lib/server/permissions.js';
import { getIncident } from '#lib/server/incidents.js';
import { isAssigned } from '#lib/server/media-access.js';
import { prepareMediaUpload } from '#lib/server/storage/media-upload.js';
import { kickWorker } from '#lib/server/video/worker.js';
import {
	countIncidentMedia,
	deleteIncidentMediaItem,
	getIncidentMediaItem,
	getIncidentMediaView,
	listIncidentMediaStatus,
	saveIncidentMediaUpload,
	setIncidentMediaCaption
} from '#lib/server/incident-media.js';

// Session-only endpoint for incident media. It sits outside every route group
// routeGroupGuard covers, so every handler gates itself: writes through
// assertCanWriteIncident (action 'media'), the status poll through the small
// read rule below. demoReadOnly and twoFactorGate still apply via hooks.

// Read rule for the status poll: owners see any incident of the companion;
// caretakers need assignment and an open incident (no shift, like asset URLs).
async function assertCanReadIncident(
	locals: RequestEvent['locals'],
	companionId: string,
	incidentId: string
): Promise<void> {
	const user = locals.user;
	if (!user) error(401, t(locals.locale, 'error.unauthorized'));
	if (user.role === 'caretaker' && !(await isAssigned(companionId, user.id))) {
		error(403, t(locals.locale, 'error.forbidden'));
	}
	const incident = await getIncident(companionId, incidentId);
	if (!incident || (user.role === 'caretaker' && incident.resolvedAt)) {
		error(404, t(locals.locale, 'error.incidentNotFound'));
	}
}

export const GET: RequestHandler = async ({ params, locals }) => {
	await assertCanReadIncident(locals, params.companionId, params.incidentId);
	return Response.json({ media: await listIncidentMediaStatus(params.incidentId) });
};

export const POST: RequestHandler = async ({ request, params, locals }) => {
	const { companionId, incidentId } = params;
	// Don't parse a body for anonymous callers; the full gate runs once updateId is known.
	if (!locals.user) error(401, t(locals.locale, 'error.unauthorized'));
	const formData = await request.formData();
	const rawUpdateId = formData.get('updateId');
	const updateId = typeof rawUpdateId === 'string' && rawUpdateId !== '' ? rawUpdateId : null;
	await assertCanWriteIncident(locals, companionId, incidentId, 'media', {
		updateId: updateId ?? undefined
	});
	const userId = locals.user!.id;

	// Cheap early rejection; saveIncidentMediaUpload re-checks under the write lock.
	if ((await countIncidentMedia(incidentId, updateId)) >= MAX_INCIDENT_MEDIA) {
		error(400, t(locals.locale, 'error.maxIncidentMediaExceeded', { max: MAX_INCIDENT_MEDIA }));
	}

	const entry = formData.get('file');
	const file = entry instanceof File ? entry : null;

	const mediaId = generateId(15);
	const prepared = await prepareMediaUpload(file, mediaId, locals.locale);
	const outcome = await saveIncidentMediaUpload({
		companionId,
		incidentId,
		updateId,
		mediaId,
		prepared,
		originalName: file?.name ?? null,
		loggedBy: userId,
		max: MAX_INCIDENT_MEDIA
	});
	if (outcome === 'putFailed') error(502, t(locals.locale, 'error.fileNotFound'));
	if (outcome === 'gone') error(404, t(locals.locale, 'error.incidentNotFound'));
	if (outcome === 'cap') {
		error(400, t(locals.locale, 'error.maxIncidentMediaExceeded', { max: MAX_INCIDENT_MEDIA }));
	}

	if (prepared.willTranscode) kickWorker();

	const item = await getIncidentMediaView(incidentId, mediaId);
	if (!item) error(404, t(locals.locale, 'error.photoNotFound'));
	return Response.json({ ...item, url: incidentMediaUrl(companionId, incidentId, item) });
};

// PATCH and DELETE gate on the row's own updateId (never one from the request):
// a row on an update follows the own-update same-day rule for caretakers, an
// overview row follows the creator-same-day rule. A missing row is gated as an
// overview row first so a caretaker can't probe for media ids.
async function gateExistingMedia(
	locals: RequestEvent['locals'],
	companionId: string,
	incidentId: string,
	mediaId: string
) {
	const item = await getIncidentMediaItem(incidentId, mediaId);
	await assertCanWriteIncident(locals, companionId, incidentId, 'media', {
		updateId: item?.updateId ?? undefined
	});
	if (!item) error(404, t(locals.locale, 'error.photoNotFound'));
	return item;
}

export const PATCH: RequestHandler = async ({ url, request, params, locals }) => {
	const item = await gateExistingMedia(
		locals,
		params.companionId,
		params.incidentId,
		url.searchParams.get('mediaId') ?? ''
	);

	const contentLength = parseInt(request.headers.get('content-length') ?? '0');
	if (contentLength > 10_000) error(400, t(locals.locale, 'error.requestBodyTooLarge'));
	const body = (await request.json().catch(() => null)) as { caption?: unknown } | null;
	const caption = typeof body?.caption === 'string' ? body.caption : '';

	await setIncidentMediaCaption(params.incidentId, item.id, caption);
	return new Response(null, { status: 204 });
};

export const DELETE: RequestHandler = async ({ url, params, locals }) => {
	const item = await gateExistingMedia(
		locals,
		params.companionId,
		params.incidentId,
		url.searchParams.get('mediaId') ?? ''
	);
	await deleteIncidentMediaItem(item);
	return new Response(null, { status: 204 });
};
