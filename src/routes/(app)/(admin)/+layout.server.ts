import { error, redirect } from '@sveltejs/kit';
import type { LayoutServerLoad } from './$types';
import { t } from '$lib/i18n';

export const load: LayoutServerLoad = async ({ locals }) => {
	if (!locals.user) redirect(302, '/auth/login');
	if (locals.user.role !== 'admin') error(403, t(locals.locale, 'error.forbidden'));
};
