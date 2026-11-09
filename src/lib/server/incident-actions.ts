import { fail, type RequestEvent } from '@sveltejs/kit';
import { t } from '#lib/i18n/index.js';
import {
	createIncidentUpdate,
	deleteIncidentUpdate,
	editIncidentUpdate,
	parseIncidentUpdateForm
} from '#lib/server/incidents.js';
import { enqueueIncidentAlert } from '#lib/server/notify/incidents.js';
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

// Caretakers never set an update's time, whatever the route asked for.
const timeAllowed = (event: IncidentEvent, allowTime: boolean) =>
	allowTime && event.locals.user?.role !== 'caretaker';

/**
 * addUpdate, editUpdate and deleteUpdate. `allowTime` is false for caretakers,
 * whose updates are always "now" whatever the form posts.
 */
export function incidentUpdateActions(opts: { allowTime: boolean }) {
	return {
		addUpdate: async (event: IncidentEvent) => {
			const g = await gateIncidentWrite(event, 'addUpdate');
			if (g.fail) return g.fail;
			const allowTime = timeAllowed(event, opts.allowTime);
			const data = await event.request.formData();
			const parsed = parseIncidentUpdateForm(data, event.locals.locale, { allowTime });
			if (!parsed.ok) return fail(400, { error: parsed.message });
			const updateId = await createIncidentUpdate(
				g.incident.id,
				parsed.value,
				event.locals.user!.id
			);
			// Owners' own updates alert nobody; only a caretaker's reach the owners.
			// The update is saved either way: a failed enqueue must not turn into a
			// 500 that invites a duplicate retry.
			if (event.locals.user!.role === 'caretaker') {
				try {
					await enqueueIncidentAlert(
						{ kind: 'incidentUpdated', incidentId: g.incident.id, updateId },
						event.locals.user!.id
					);
				} catch (err) {
					console.error('[incidents] update alert enqueue failed:', err);
				}
			}
			return { updateId };
		},

		editUpdate: async (event: IncidentEvent) => {
			const data = await event.request.formData();
			const updateId = formString(data, 'updateId');
			const g = await gateIncidentWrite(event, 'editUpdate', updateId);
			if (g.fail) return g.fail;
			const allowTime = timeAllowed(event, opts.allowTime);
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
			// A caretaker's delete would cascade to photos an owner added to their
			// update, so it is refused while any are there.
			const user = event.locals.user!;
			const outcome = await deleteIncidentUpdate(g.incident.id, updateId, {
				onlyMediaOf: user.role === 'caretaker' ? user.id : undefined
			});
			if (outcome === 'othersMedia')
				return fail(403, { error: t(event.locals.locale, 'error.forbidden') });
			if (outcome === 'notFound')
				return fail(404, { error: t(event.locals.locale, 'error.incidentNotFound') });
			return { ok: true };
		}
	};
}
