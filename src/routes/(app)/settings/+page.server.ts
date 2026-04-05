import { error, fail, redirect } from '@sveltejs/kit';
import type { PageServerLoad, Actions } from './$types';
import { db, schema } from '$lib/server/db';
import { eq } from 'drizzle-orm';
import { handleAccountUpdate } from '$lib/server/account';
import { isSecureRequest } from '$lib/server/auth';
import { t, SUPPORTED_LOCALES } from '$lib/i18n';
import type { Locale } from '$lib/i18n';

export const load: PageServerLoad = async ({ locals }) => {
	if (!locals.user) redirect(302, '/auth/login');

	const companions =
		locals.user.role !== 'caretaker'
			? await db.query.companions.findMany({
					where: eq(schema.companions.isActive, true),
					orderBy: (c, { asc }) => [asc(c.name)]
				})
			: [];

	const archivedCompanions =
		locals.user.role !== 'caretaker'
			? await db.query.companions.findMany({
					where: eq(schema.companions.isActive, false),
					orderBy: (c, { desc }) => [desc(c.archivedAt)]
				})
			: [];

	return { user: locals.user, companions, archivedCompanions };
};

export const actions: Actions = {
	theme: async ({ request, locals, cookies }) => {
		if (!locals.user) redirect(302, '/auth/login');

		const data = await request.formData();
		const theme = String(data.get('theme') ?? 'system');
		if (!['light', 'dark', 'system'].includes(theme)) {
			return fail(400, { themeError: t(locals.locale, 'error.invalidTheme') });
		}

		await db
			.update(schema.users)
			.set({ theme: theme as 'light' | 'dark' | 'system' })
			.where(eq(schema.users.id, locals.user.id));

		cookies.set('einvault_theme', theme, {
			path: '/',
			httpOnly: false,
			secure: isSecureRequest(request),
			sameSite: 'strict',
			maxAge: 60 * 60 * 24 * 365
		});

		return { themeSuccess: true };
	},

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

	restore: async ({ request, locals }) => {
		if (!locals.user) redirect(302, '/auth/login');
		if (locals.user.role !== 'admin') error(403, t(locals.locale, 'error.forbidden'));

		const data = await request.formData();
		const companionId = String(data.get('companionId') ?? '');

		await db
			.update(schema.companions)
			.set({ isActive: true, archivedAt: null, archiveNote: null })
			.where(eq(schema.companions.id, companionId));

		return { restoreSuccess: true };
	}
};
