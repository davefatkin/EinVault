import { error, fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { t } from '#lib/i18n/index.js';
import { localDateISO } from '#lib/date.js';
import { parseLeadDays } from '#lib/reminderLeadTimes.js';
import { getSupplyForCompanion, parseSupplyForm, updateSupply } from '#lib/server/supplies.js';
import {
	linkedCompanionIds,
	refuseCompanions,
	supplyCompanionOptions,
	supplyFormValues,
	supplyHome,
	supplyOwnerOnly
} from '#lib/server/supply-actions.js';
import type { SupplyFormValues } from '#lib/supplies.js';

export const load: PageServerLoad = async ({ params, locals, parent }) => {
	if (!locals.user) redirect(302, '/auth/login');
	if (locals.user.role === 'caretaker') redirect(302, '/care');
	const { companion } = await parent();
	const supply = await getSupplyForCompanion(params.companionId, params.id);
	if (!supply) error(404, t(locals.locale, 'error.supplyNotFound'));
	// An archived pet's supplies are read-only.
	if (!companion.isActive) redirect(303, `/${params.companionId}/supplies/${params.id}`);
	const linked = await linkedCompanionIds(supply.id);
	const amount = (n: number | null) => (n === null ? '' : String(n));
	const values: SupplyFormValues = {
		name: supply.name,
		kind: supply.kind,
		unit: supply.unit ?? '',
		startingQuantity: '',
		lastsDays: amount(supply.lastsDays),
		firstPurchaseDate: '',
		expiresOn: supply.expiresOn ?? '',
		alertsEnabled: supply.alertsEnabled,
		runOutLeadDays: parseLeadDays(supply.runOutLeadDays),
		expiryLeadDays: parseLeadDays(supply.expiryLeadDays),
		lowStockAt: amount(supply.lowStockAt),
		notes: supply.notes ?? '',
		companionIds: linked
	};
	return {
		companion,
		supply: { id: supply.id, name: supply.name, kind: supply.kind },
		values,
		companions: await supplyCompanionOptions(linked),
		today: localDateISO()
	};
};

export const actions: Actions = {
	update: async ({ request, params, locals }) => {
		const denied = await supplyOwnerOnly(locals, params.companionId, params.id);
		if (denied) return denied;
		const data = await request.formData();
		const values = supplyFormValues(data);
		const parsed = parseSupplyForm(data);
		if (!parsed.ok) return fail(400, { error: t(locals.locale, parsed.error), values });
		const options = await supplyCompanionOptions(await linkedCompanionIds(params.id));
		const refused = refuseCompanions(parsed.companionIds, options, locals.locale, values);
		if (refused) return refused;
		// The form posts the stored kind; a different one is refused, not converted.
		if (!(await updateSupply(params.id, parsed.value, parsed.companionIds)))
			return fail(400, { error: t(locals.locale, 'error.invalidSupplyKind'), values });
		const home = supplyHome(params.companionId, parsed.companionIds, options);
		redirect(303, `/${home}/supplies/${params.id}`);
	}
};
