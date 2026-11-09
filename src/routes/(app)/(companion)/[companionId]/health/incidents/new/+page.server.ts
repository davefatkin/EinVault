import { fail, redirect } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';
import type { Actions, PageServerLoad } from './$types';
import { t } from '#lib/i18n/index.js';
import { reminderPrefillUrl } from '#lib/health.js';
import { incidentPath } from '#lib/incidents.js';
import { db, schema } from '#lib/server/db/index.js';
import { createIncident, parseIncidentForm } from '#lib/server/incidents.js';
import { UPLOAD_MAX_MB, VIDEO_MAX_MB } from '#lib/server/env.js';

export const load: PageServerLoad = async ({ locals, parent }) => {
	if (!locals.user) redirect(302, '/auth/login');
	const { companion } = await parent();
	if (!companion.isActive) redirect(302, `/${companion.id}/health`);
	return { companion, uploadMaxMb: UPLOAD_MAX_MB, videoMaxMb: VIDEO_MAX_MB };
};

export const actions: Actions = {
	// Returns the new id so the page can upload the picked files before moving
	// on (a redirect here would skip them). Without JavaScript there are no
	// files to upload, so the action redirects itself.
	create: async ({ request, params, locals }) => {
		if (!locals.user) return fail(401, { error: t(locals.locale, 'error.unauthorized') });
		if (locals.user.role === 'caretaker')
			return fail(403, { error: t(locals.locale, 'error.forbidden') });
		// Actions run before the layout load that 404s an unknown companion.
		const companion = await db.query.companions.findFirst({
			where: eq(schema.companions.id, params.companionId),
			columns: { id: true }
		});
		if (!companion) return fail(404, { error: t(locals.locale, 'error.companionNotFound') });
		const data = await request.formData();
		const parsed = parseIncidentForm(data, locals.locale, { allowStart: true });
		if (!parsed.ok) return fail(400, { error: parsed.message });

		const id = await createIncident(params.companionId, parsed.value, locals.user.id);
		const reminderUrl =
			data.get('andReminder') === '1'
				? reminderPrefillUrl(params.companionId, 'incident', parsed.value.title, parsed.value.notes)
				: null;
		if (data.get('afterSave') !== 'client') {
			redirect(303, reminderUrl ?? incidentPath(params.companionId, id));
		}
		return { id, reminderUrl };
	}
};
