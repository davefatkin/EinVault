import { error, fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad, RequestEvent } from './$types';
import { t } from '#lib/i18n/index.js';
import { loadIncidentDetail } from '#lib/server/incident-detail.js';
import {
	createIncidentUpdate,
	deleteIncidentUpdate,
	editIncidentUpdate,
	parseIncidentForm,
	parseIncidentUpdateForm,
	setIncidentResolved,
	updateIncidentOverview
} from '#lib/server/incidents.js';
import { linkToIncident, unlinkFromIncident } from '#lib/server/incident-links.js';
import { deleteHealthEvent } from '#lib/server/journal-links.js';
import { checkIncidentWrite, type IncidentWriteAction } from '#lib/server/permissions.js';
import { parseFormTimestamp } from '#lib/server/validation.js';
import { UPLOAD_MAX_MB, VIDEO_MAX_MB } from '#lib/server/env.js';

export const load: PageServerLoad = async ({ params, locals, parent }) => {
	if (!locals.user) redirect(302, '/auth/login');
	const { companion } = await parent();
	const detail = await loadIncidentDetail(params.companionId, params.id, 'owner');
	if (!detail) error(404, t(locals.locale, 'error.incidentNotFound'));
	return { companion, detail, uploadMaxMb: UPLOAD_MAX_MB, videoMaxMb: VIDEO_MAX_MB };
};

type Event = RequestEvent;

// Every action starts here: the permission check maps straight to fail().
async function gate(event: Event, action: IncidentWriteAction, updateId?: string) {
	const { locals, params } = event;
	const check = await checkIncidentWrite(locals.user, params.companionId, params.id, action, {
		updateId
	});
	if (!check.ok) return { fail: fail(check.status, { error: t(locals.locale, check.key) }) };
	return { incident: check.incident };
}

const formId = (data: FormData, name: string) => {
	const v = data.get(name);
	return typeof v === 'string' ? v : '';
};

export const actions: Actions = {
	addUpdate: async (event) => {
		const g = await gate(event, 'addUpdate');
		if (g.fail) return g.fail;
		const data = await event.request.formData();
		const parsed = parseIncidentUpdateForm(data, event.locals.locale, { allowTime: true });
		if (!parsed.ok) return fail(400, { error: parsed.message });
		const updateId = await createIncidentUpdate(g.incident.id, parsed.value, event.locals.user!.id);
		return { updateId };
	},

	editUpdate: async (event) => {
		const data = await event.request.formData();
		const updateId = formId(data, 'updateId');
		const g = await gate(event, 'editUpdate', updateId);
		if (g.fail) return g.fail;
		const parsed = parseIncidentUpdateForm(data, event.locals.locale, { allowTime: true });
		if (!parsed.ok) return fail(400, { error: parsed.message });
		if (!(await editIncidentUpdate(g.incident.id, updateId, parsed.value)))
			return fail(404, { error: t(event.locals.locale, 'error.incidentNotFound') });
		return { ok: true };
	},

	deleteUpdate: async (event) => {
		const data = await event.request.formData();
		const updateId = formId(data, 'updateId');
		const g = await gate(event, 'editUpdate', updateId);
		if (g.fail) return g.fail;
		if (!(await deleteIncidentUpdate(g.incident.id, updateId)))
			return fail(404, { error: t(event.locals.locale, 'error.incidentNotFound') });
		return { ok: true };
	},

	editOverview: async (event) => {
		const g = await gate(event, 'overview');
		if (g.fail) return g.fail;
		const data = await event.request.formData();
		const parsed = parseIncidentForm(data, event.locals.locale, { allowStart: true });
		if (!parsed.ok) return fail(400, { error: parsed.message });
		await updateIncidentOverview(event.params.companionId, g.incident.id, parsed.value);
		return { ok: true };
	},

	// Resolved time (default now) plus an optional closing update dated at the
	// same moment, so it sits just before the resolution on the timeline.
	resolve: async (event) => {
		const { locals, params } = event;
		const g = await gate(event, 'resolve');
		if (g.fail) return g.fail;
		const data = await event.request.formData();
		const resolvedAt = parseFormTimestamp(data.get('resolvedAt'));
		if (!resolvedAt) return fail(400, { error: t(locals.locale, 'error.invalidDateTime') });
		if (resolvedAt < g.incident.occurredAt)
			return fail(400, { error: t(locals.locale, 'error.resolvedBeforeStart') });
		if (formId(data, 'body').trim()) {
			const parsed = parseIncidentUpdateForm(data, locals.locale, { allowTime: false });
			if (!parsed.ok) return fail(400, { error: parsed.message });
			await createIncidentUpdate(
				g.incident.id,
				{ ...parsed.value, occurredAt: resolvedAt },
				locals.user!.id
			);
		}
		await setIncidentResolved(params.companionId, g.incident.id, resolvedAt);
		return { ok: true };
	},

	reopen: async (event) => {
		const g = await gate(event, 'resolve');
		if (g.fail) return g.fail;
		await setIncidentResolved(event.params.companionId, g.incident.id, null);
		return { ok: true };
	},

	delete: async (event) => {
		const g = await gate(event, 'delete');
		if (g.fail) return g.fail;
		await deleteHealthEvent(event.params.companionId, g.incident.id);
		redirect(303, `/${event.params.companionId}/health`);
	},

	link: async (event) => {
		const { locals, params } = event;
		const g = await gate(event, 'link');
		if (g.fail) return g.fail;
		const data = await event.request.formData();
		const outcome = await linkToIncident(
			params.companionId,
			g.incident.id,
			formId(data, 'healthEventId')
		);
		if (outcome !== 'linked')
			return fail(outcome === 'notFound' ? 404 : 400, {
				error: t(locals.locale, 'error.eventNotFound')
			});
		return { ok: true };
	},

	unlink: async (event) => {
		const { locals, params } = event;
		const g = await gate(event, 'link');
		if (g.fail) return g.fail;
		const data = await event.request.formData();
		if (
			!(await unlinkFromIncident(params.companionId, g.incident.id, formId(data, 'healthEventId')))
		)
			return fail(404, { error: t(locals.locale, 'error.eventNotFound') });
		return { ok: true };
	}
};
