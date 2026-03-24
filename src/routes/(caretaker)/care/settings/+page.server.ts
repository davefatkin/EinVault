import { redirect } from '@sveltejs/kit';
import type { PageServerLoad, Actions } from './$types';
import { getUpcomingShifts } from '$lib/server/shifts';
import { handleAccountUpdate } from '$lib/server/account';

export const load: PageServerLoad = async ({ locals }) => {
	if (!locals.user) redirect(302, '/auth/login');
	const upcomingShifts = await getUpcomingShifts(locals.user.id);
	return { user: locals.user, upcomingShifts };
};

export const actions: Actions = {
	account: async ({ request, locals, cookies }) => {
		if (!locals.user) redirect(302, '/auth/login');
		return handleAccountUpdate(locals.user.id, request, cookies);
	}
};
