import { error, fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { t } from '#lib/i18n/index.js';
import { careIncidentPath } from '#lib/incidents.js';
import { authorizeCompanions } from '#lib/server/companion-scope.js';
import { failCareError } from '#lib/server/care-errors.js';
import { createIncident, parseIncidentForm } from '#lib/server/incidents.js';
import { enqueueIncidentAlert } from '#lib/server/notify/incidents.js';
import { UPLOAD_MAX_MB, VIDEO_MAX_MB } from '#lib/server/env.js';

// Caretaker "Log incident". The load checks the assignment itself against the
// caretaker layout's companions (there is no care/[companionId] layout doing
// it); off shift there is nothing to log, so it goes back to the care page.
export const load: PageServerLoad = async ({ params, parent, locals }) => {
	const { companions, isOnShift } = await parent();
	const companion = companions.find((c) => c.id === params.companionId);
	if (!companion) error(403, t(locals.locale, 'error.notAssignedToCompanion'));
	if (!isOnShift) redirect(302, `/care/${companion.id}`);
	return { companion, uploadMaxMb: UPLOAD_MAX_MB, videoMaxMb: VIDEO_MAX_MB };
};

export const actions: Actions = {
	// Actions run before any load, and the route guard only checks the role:
	// shift, assignment and active companion are checked here. The start is
	// always now. Returns the id so the page can upload the picked photos to
	// the overview (the caretaker overview-media rule allows exactly this: an
	// incident they logged today). Without JavaScript it redirects itself.
	create: async ({ request, params, locals }) => {
		if (!locals.user) return fail(401, { error: t(locals.locale, 'error.unauthorized') });
		const scope = await authorizeCompanions(locals.user, [params.companionId]);
		if (!scope.ok) return failCareError(scope.code, locals.locale, 'error');

		const data = await request.formData();
		const parsed = parseIncidentForm(data, locals.locale, { allowStart: false });
		if (!parsed.ok) return fail(400, { error: parsed.message });

		const id = await createIncident(params.companionId, parsed.value, locals.user.id);
		// The incident is saved either way: a failed enqueue must not turn into a
		// 500 that invites a duplicate retry.
		try {
			await enqueueIncidentAlert({ kind: 'incidentLogged', incidentId: id }, locals.user.id);
		} catch (err) {
			console.error('[incidents] new incident alert enqueue failed:', err);
		}
		if (data.get('afterSave') !== 'client') redirect(303, careIncidentPath(params.companionId, id));
		return { id };
	}
};
