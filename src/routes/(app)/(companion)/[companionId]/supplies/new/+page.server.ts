import { redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { localDateISO } from '#lib/date.js';
import { getAppSettings } from '#lib/server/app-settings.js';
import { createAction, supplyCompanionOptions } from '#lib/server/supply-actions.js';

export const load: PageServerLoad = async ({ params, locals, parent }) => {
	if (!locals.user) redirect(302, '/auth/login');
	if (locals.user.role === 'caretaker') redirect(302, '/care');
	const { companion } = await parent();
	// An archived pet's supplies are read-only.
	if (!companion.isActive) redirect(303, `/${params.companionId}/supplies`);
	const [companions, { currency }] = await Promise.all([
		supplyCompanionOptions(),
		getAppSettings()
	]);
	return { companion, companions, currency, today: localDateISO() };
};

export const actions: Actions = { create: createAction };
