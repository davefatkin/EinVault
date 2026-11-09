import { fail, type RequestEvent } from '@sveltejs/kit';
import { t } from '#lib/i18n/index.js';
import {
	createIncidentUpdate,
	deleteIncidentUpdate,
	editIncidentUpdate,
	parseIncidentUpdateForm
} from '#lib/server/incidents.js';
import { checkIncidentWrite, type IncidentWriteAction } from '#lib/server/permissions.js';

// Form actions shared by the owner and caretaker incident pages. Both routes
// have the params { companionId, id }; every action starts at gateIncidentWrite,
// which maps checkIncidentWrite (role, shift, assignment, open, own update
// today) straight to fail().

type IncidentEvent = RequestEvent<{ companionId: string; id: string }>;

export async function gateIncidentWrite(
	event: IncidentEvent,
	action: IncidentWriteAction,
	updateId?: string
) {
	const { locals, params } = event;
	const check = await checkIncidentWrite(locals.user, params.companionId, params.id, action, {
		updateId
	});
	if (!check.ok) return { fail: fail(check.status, { error: t(locals.locale, check.key) }) };
	return { incident: check.incident };
}

export const formString = (data: FormData, name: string) => {
	const v = data.get(name);
	return typeof v === 'string' ? v : '';
};

/**
 * addUpdate, editUpdate and deleteUpdate. `allowTime` is false for caretakers,
 * whose updates are always "now" whatever the form posts.
 */
export function incidentUpdateActions({ allowTime }: { allowTime: boolean }) {
	return {
		addUpdate: async (event: IncidentEvent) => {
			const g = await gateIncidentWrite(event, 'addUpdate');
			if (g.fail) return g.fail;
			const data = await event.request.formData();
			const parsed = parseIncidentUpdateForm(data, event.locals.locale, { allowTime });
			if (!parsed.ok) return fail(400, { error: parsed.message });
			const updateId = await createIncidentUpdate(
				g.incident.id,
				parsed.value,
				event.locals.user!.id
			);
			return { updateId };
		},

		editUpdate: async (event: IncidentEvent) => {
			const data = await event.request.formData();
			const updateId = formString(data, 'updateId');
			const g = await gateIncidentWrite(event, 'editUpdate', updateId);
			if (g.fail) return g.fail;
			const parsed = parseIncidentUpdateForm(data, event.locals.locale, { allowTime });
			if (!parsed.ok) return fail(400, { error: parsed.message });
			// Without allowTime the parsed time is "now"; an edit keeps the
			// update where it was on the timeline instead.
			const { occurredAt, ...fields } = parsed.value;
			const input = allowTime ? { ...fields, occurredAt } : fields;
			if (!(await editIncidentUpdate(g.incident.id, updateId, input)))
				return fail(404, { error: t(event.locals.locale, 'error.incidentNotFound') });
			return { ok: true };
		},

		deleteUpdate: async (event: IncidentEvent) => {
			const data = await event.request.formData();
			const updateId = formString(data, 'updateId');
			const g = await gateIncidentWrite(event, 'editUpdate', updateId);
			if (g.fail) return g.fail;
			if (!(await deleteIncidentUpdate(g.incident.id, updateId)))
				return fail(404, { error: t(event.locals.locale, 'error.incidentNotFound') });
			return { ok: true };
		}
	};
}
