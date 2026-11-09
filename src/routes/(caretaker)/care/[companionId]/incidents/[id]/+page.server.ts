import { error } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { t } from '#lib/i18n/index.js';
import { loadIncidentDetail } from '#lib/server/incident-detail.js';
import { incidentUpdateActions } from '#lib/server/incident-actions.js';
import { UPLOAD_MAX_MB, VIDEO_MAX_MB } from '#lib/server/env.js';

// Caretaker incident page. There is no care/[companionId] layout, so the load
// checks the assignment itself against the caretaker layout's companions
// (assigned and active), as the sheet does; loadIncidentDetail knows nothing
// about the viewer. Off shift the page still loads (read-only); the actions
// below need a shift, the assignment and an open incident via checkIncidentWrite.
export const load: PageServerLoad = async ({ params, parent, locals }) => {
	const { companions } = await parent();
	const companion = companions.find((c) => c.id === params.companionId);
	if (!companion) error(403, t(locals.locale, 'error.notAssignedToCompanion'));

	const detail = await loadIncidentDetail(params.companionId, params.id, 'caretaker');
	if (!detail) error(404, t(locals.locale, 'error.incidentNotFound'));
	return { companion, detail, uploadMaxMb: UPLOAD_MAX_MB, videoMaxMb: VIDEO_MAX_MB };
};

// Caretakers add updates ("now") and edit or delete their own from today. No
// overview edit, resolve, link or delete actions exist here at all.
export const actions: Actions = incidentUpdateActions({ allowTime: false });
