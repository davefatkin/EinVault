import { fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { t } from '#lib/i18n/index.js';
import { localDateISO } from '#lib/date.js';
import { ownerOnly } from '#lib/server/medication-actions.js';
import { createSupply, parseSupplyForm } from '#lib/server/supplies.js';
import {
	refuseCompanions,
	supplyCompanionOptions,
	supplyFormValues,
	supplyHome
} from '#lib/server/supply-actions.js';

export const load: PageServerLoad = async ({ params, locals, parent }) => {
	if (!locals.user) redirect(302, '/auth/login');
	if (locals.user.role === 'caretaker') redirect(302, '/care');
	const { companion } = await parent();
	// An archived pet's supplies are read-only.
	if (!companion.isActive) redirect(303, `/${params.companionId}/supplies`);
	return { companion, companions: await supplyCompanionOptions(), today: localDateISO() };
};

export const actions: Actions = {
	create: async ({ request, params, locals }) => {
		const denied = await ownerOnly(locals, params.companionId);
		if (denied) return denied;
		const data = await request.formData();
		const values = supplyFormValues(data);
		const parsed = parseSupplyForm(data);
		if (!parsed.ok)
			return fail(400, { error: t(locals.locale, parsed.error, parsed.vars), values });
		const options = await supplyCompanionOptions();
		const refused = refuseCompanions(parsed.companionIds, options, locals.locale, values);
		if (refused) return refused;
		const id = await createSupply(parsed.value, parsed.companionIds, locals.user!.id);
		const home = supplyHome(params.companionId, parsed.companionIds, options);
		redirect(303, `/${home}/supplies/${id}`);
	}
};
