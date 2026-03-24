import { redirect } from '@sveltejs/kit';
import type { Actions } from './$types';
import {
	invalidateSession,
	SESSION_COOKIE_NAME,
	makeBlankCookieOptions
} from '$lib/server/auth/session';
import { isSecureRequest } from '$lib/server/auth';

export const actions: Actions = {
	default: async ({ locals, cookies, request }) => {
		if (locals.session) {
			await invalidateSession(locals.session.id);
		}

		cookies.set(SESSION_COOKIE_NAME, '', makeBlankCookieOptions(isSecureRequest(request)));

		redirect(302, '/auth/login');
	}
};
