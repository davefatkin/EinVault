import { error, fail, redirect } from '@sveltejs/kit';
import type { PageServerLoad, Actions } from './$types';
import { db, schema } from '$lib/server/db';
import { eq } from 'drizzle-orm';
import {
	handleAccountUpdate,
	handleReminderUndoUpdate,
	handleDefaultRecurrenceUpdate,
	handleNotificationsUpdate,
	handleTestEmail,
	handleTestNtfy
} from '$lib/server/account';
import { isMailEnabled } from '$lib/server/mail';
import { isNtfyEnabled } from '$lib/server/notify/ntfy';
import { isSecureRequest } from '$lib/server/auth';
import { t, SUPPORTED_LOCALES } from '$lib/i18n';
import type { Locale } from '$lib/i18n';
import { REMINDER_UNDO_SECONDS_DEFAULT, CALENDAR_FEED_ENABLED } from '$lib/server/env';
import { enableFeedToken, disableFeedToken } from '$lib/server/calendarToken';
import {
	totpBegin,
	totpConfirm,
	totpRegenerate,
	totpDisable
} from '$lib/server/auth/two-factor-actions';

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

	const calUser = await db.query.users.findFirst({ where: eq(schema.users.id, locals.user.id) });

	const { isTwoFactorConfigured } = await import('$lib/server/auth/totp-crypto');
	const { getAppSettings } = await import('$lib/server/app-settings');
	const { requiresTwoFactor } = await import('$lib/server/auth/two-factor');
	const { require2fa } = await getAppSettings();
	const twoFactorAvailable = isTwoFactorConfigured();
	const twoFactorEnforced = requiresTwoFactor(
		{ role: locals.user.role, isOidc: locals.user.isOidc, totpEnabled: false },
		require2fa
	);

	return {
		user: locals.user,
		companions,
		archivedCompanions,
		reminderUndoDefault: REMINDER_UNDO_SECONDS_DEFAULT,
		mailEnabled: isMailEnabled(),
		ntfyEnabled: isNtfyEnabled(),
		calendarFeedAvailable: CALENDAR_FEED_ENABLED,
		calendarFeedEnabled: calUser?.calendarFeedToken != null,
		twoFactorAvailable,
		twoFactorEnforced
	};
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

	reminderUndo: async ({ request, locals }) => {
		if (!locals.user) redirect(302, '/auth/login');
		return handleReminderUndoUpdate(locals.user.id, request, locals.locale);
	},

	defaultRecurrence: async ({ request, locals }) => {
		if (!locals.user) redirect(302, '/auth/login');
		return handleDefaultRecurrenceUpdate(locals.user.id, request, locals.locale);
	},

	notifications: async ({ request, locals }) => {
		if (!locals.user) redirect(302, '/auth/login');
		return handleNotificationsUpdate(locals.user.id, request, locals.locale);
	},

	testEmail: async ({ locals }) => {
		if (!locals.user) redirect(302, '/auth/login');
		return handleTestEmail(locals.user, locals.locale);
	},

	testNtfy: async ({ locals }) => {
		if (!locals.user) redirect(302, '/auth/login');
		return handleTestNtfy(locals.user, locals.locale);
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
	},

	calendarEnable: async ({ locals }) => {
		if (!locals.user) return fail(401);
		if (!CALENDAR_FEED_ENABLED) return fail(403);
		const token = await enableFeedToken(locals.user.id);
		return { calendarToken: token };
	},

	calendarDisable: async ({ locals }) => {
		if (!locals.user) return fail(401);
		await disableFeedToken(locals.user.id);
		return { calendarDisabled: true };
	},

	totpBegin: async ({ locals, request }) => {
		if (!locals.user) return fail(401);
		return totpBegin({ user: locals.user, request, locale: locals.locale });
	},

	totpConfirm: async ({ locals, request }) => {
		if (!locals.user) return fail(401);
		return totpConfirm({ user: locals.user, request, locale: locals.locale });
	},

	totpRegenerate: async ({ locals, request }) => {
		if (!locals.user) return fail(401);
		return totpRegenerate({ user: locals.user, request, locale: locals.locale });
	},

	totpDisable: async ({ locals, request }) => {
		if (!locals.user) return fail(401);
		return totpDisable({ user: locals.user, request, locale: locals.locale });
	}
};
