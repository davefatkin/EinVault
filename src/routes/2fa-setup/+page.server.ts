import { redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { getAppSettings } from '$lib/server/app-settings';
import { requiresTwoFactor } from '$lib/server/auth/two-factor';
import { isTwoFactorConfigured } from '$lib/server/auth/totp-crypto';
import { totpBegin, totpConfirm } from '$lib/server/auth/two-factor-actions';

export const load: PageServerLoad = async ({ locals }) => {
	if (!locals.user) {
		redirect(302, '/auth/login');
	}
	if (!isTwoFactorConfigured()) {
		redirect(302, '/');
	}
	const { require2fa } = await getAppSettings();
	const required = requiresTwoFactor(
		{ role: locals.user.role, isOidc: locals.user.isOidc, totpEnabled: locals.user.totpEnabled },
		require2fa
	);
	if (!required) {
		redirect(302, '/');
	}
	return {};
};

export const actions: Actions = {
	totpBegin: async ({ locals, request }) => {
		if (!locals.user) redirect(302, '/auth/login');
		return totpBegin({ user: locals.user, request, locale: locals.locale });
	},

	totpConfirm: async ({ locals, request }) => {
		if (!locals.user) redirect(302, '/auth/login');
		// Return the result (including the one-time backup codes) so the page can
		// show them. The user is now enrolled; the central gate clears on their
		// next request, so the "Continue" link to / works.
		return totpConfirm({ user: locals.user, request, locale: locals.locale });
	}
};
