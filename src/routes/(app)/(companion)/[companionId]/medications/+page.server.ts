import { fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { localDateISO } from '#lib/date.js';
import {
	createMedication,
	listMedicationSummaries,
	parseMedicationForm
} from '#lib/server/medications.js';
import { listCountedSupplyOptions } from '#lib/server/supplies.js';
import { givenAction, medicationFormValues, ownerOnly } from '#lib/server/medication-actions.js';

export const load: PageServerLoad = async ({ params, locals, parent }) => {
	if (!locals.user) redirect(302, '/auth/login');
	if (locals.user.role === 'caretaker') redirect(302, '/care');
	const { companion } = await parent();
	const today = localDateISO();
	const medications = await listMedicationSummaries([params.companionId], {
		activeOnly: false,
		today,
		includeSupply: true
	});
	const supplyOptions = await listCountedSupplyOptions(params.companionId);
	return { companion, medications, supplyOptions, today };
};

export const actions: Actions = {
	create: async ({ request, params, locals }) => {
		const denied = await ownerOnly(locals, params.companionId);
		if (denied) return denied;
		const data = await request.formData();
		const parsed = parseMedicationForm(data, locals.locale, localDateISO(), params.companionId);
		if (!parsed.ok) return fail(400, { error: parsed.message, values: medicationFormValues(data) });
		const createdId = await createMedication(params.companionId, parsed.value, locals.user!.id);
		return {
			created: true,
			createdId,
			createdName: parsed.value.name,
			createdDose: parsed.value.dose
		};
	},

	given: givenAction
};
