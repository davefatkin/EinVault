import { fail, redirect } from '@sveltejs/kit';
import type { PageServerLoad, Actions } from './$types';
import { getUpcomingShifts } from '$lib/server/shifts';
import { handleAccountUpdate, handleReminderUndoUpdate } from '$lib/server/account';
import { t, SUPPORTED_LOCALES } from '$lib/i18n';
import type { Locale } from '$lib/i18n';
import { db, schema } from '$lib/server/db';
import { eq } from 'drizzle-orm';
import { isSecureRequest } from '$lib/server/auth';
import { REMINDER_UNDO_SECONDS_DEFAULT } from '$lib/server/env';

export const load: PageServerLoad = async ({ locals }) => {
	if (!locals.user) redirect(302, '/auth/login');
	const upcomingShifts = await getUpcomingShifts(locals.user.id);
	return {
		user: locals.user,
		upcomingShifts,
		reminderUndoDefault: REMINDER_UNDO_SECONDS_DEFAULT
	};
};

export const actions: Actions = {
	locale: async ({ request, locals, cookies }) => {
		if (!locals.user) redirect(302, '/auth/login');

		const data = await request.formData();
		const locale = String(data.get('locale') ?? 'en');
		if (!SUPPORTED_LOCALES.includes(locale as Locale)) {
			return fail(400, { localeError: t(locals.locale, 'error.invalidLocale') });
		}

		await db
			.update(schema.users)
			.set({ locale: locale as Locale })
			.where(eq(schema.users.id, locals.user.id));

		cookies.set('einvault_locale', locale, {
			path: '/',
			httpOnly: false,
			secure: isSecureRequest(request),
			sameSite: 'strict',
			maxAge: 60 * 60 * 24 * 365
		});

		return { localeSuccess: true };
	},

	account: async ({ request, locals, cookies }) => {
		if (!locals.user) redirect(302, '/auth/login');
		return handleAccountUpdate(locals.user.id, request, cookies, locals.locale);
	},

	reminderUndo: async ({ request, locals }) => {
		if (!locals.user) redirect(302, '/auth/login');
		return handleReminderUndoUpdate(locals.user.id, request, locals.locale);
	}
};
