import { fail, type Action, type RequestEvent } from '@sveltejs/kit';
import { t } from '#lib/i18n/index.js';
import { getMedication, logDose } from '#lib/server/medications.js';
import type { MedicationFormValues } from '#lib/medications.js';

type Locals = RequestEvent['locals'];

/** Owner pages only: the route guard checks the group, this checks the role. */
export function ownerOnly(locals: Locals) {
	if (!locals.user) return fail(401, { error: t(locals.locale, 'error.unauthorized') });
	if (locals.user.role === 'caretaker')
		return fail(403, { error: t(locals.locale, 'error.forbidden') });
	return null;
}

/** "Given" on the owner medication pages. logDose isn't companion-scoped, so check first. */
export const givenAction: Action<{ companionId: string }> = async ({ request, params, locals }) => {
	const denied = ownerOnly(locals);
	if (denied) return denied;
	const data = await request.formData();
	const id = String(data.get('id') ?? '');
	const medication = id ? await getMedication(params.companionId, id) : undefined;
	if (!medication) return fail(404, { error: t(locals.locale, 'error.medicationNotFound') });
	const outcome = await logDose(medication.id, locals.user!);
	if (outcome === 'notFound')
		return fail(404, { error: t(locals.locale, 'error.medicationNotFound') });
	if (outcome === 'ended') return fail(400, { error: t(locals.locale, 'error.medicationEnded') });
	return { doseLogged: medication.name };
};

/** What was typed, so a failed save re-renders the form with it. */
export function medicationFormValues(data: FormData): MedicationFormValues {
	const field = (name: string) => String(data.get(name) ?? '');
	return {
		name: field('name'),
		dose: field('dose'),
		instructions: field('instructions'),
		startedOn: field('startedOn'),
		endedOn: field('endedOn')
	};
}
