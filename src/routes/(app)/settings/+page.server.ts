import { error, fail, redirect } from '@sveltejs/kit';
import type { PageServerLoad, Actions } from './$types';
import { db, schema } from '#lib/server/db/index.js';
import { eq } from 'drizzle-orm';
import {
	handleAccountUpdate,
	handleReminderUndoUpdate,
	handleGettingStartedPref,
	handleDefaultRecurrenceUpdate,
	handleNotificationsUpdate,
	handleTestEmail,
	handleTestNtfy
} from '#lib/server/account.js';
import { loadGettingStartedProgress } from '#lib/server/getting-started.js';
import { resolveCardMode, type GettingStartedPref } from '#lib/gettingStarted.js';
import { localDateISO } from '#lib/date.js';
import { isMailEnabled } from '#lib/server/mail/index.js';
import { isNtfyEnabled } from '#lib/server/notify/ntfy.js';
import { isSecureRequest } from '#lib/server/auth/index.js';
import { t, SUPPORTED_LOCALES } from '#lib/i18n/index.js';
import type { Locale } from '#lib/i18n/index.js';
import {
	REMINDER_UNDO_SECONDS_DEFAULT,
	CALENDAR_FEED_ENABLED,
	API_TOKENS_ENABLED,
	DEMO_MODE
} from '#lib/server/env.js';
import { enableFeedToken, disableFeedToken } from '#lib/server/calendarToken.js';
import { listApiTokens } from '#lib/server/api-tokens.js';
import {
	handleApiTokenCreate,
	handleApiTokenRevoke,
	handleApiTokenRotate
} from '#lib/server/api-token-actions.js';
import {
	totpBegin,
	totpConfirm,
	totpRegenerate,
	totpDisable
} from '#lib/server/auth/two-factor-actions.js';

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

	const { isTwoFactorConfigured } = await import('#lib/server/auth/totp-crypto.js');
	const { getAppSettings } = await import('#lib/server/app-settings.js');
	const { requiresTwoFactor } = await import('#lib/server/auth/two-factor.js');
	const { require2fa } = await getAppSettings();
	const twoFactorAvailable = isTwoFactorConfigured();
	const twoFactorEnforced = requiresTwoFactor(
		{ role: locals.user.role, isOidc: locals.user.isOidc, totpEnabled: false },
		require2fa
	);

	// Read-only: Settings never persists the card's seen/completed markers.
	let gettingStarted: { showing: boolean; complete: boolean; doneCount: number } | null = null;
	if (!DEMO_MODE && locals.user.role !== 'caretaker') {
		const progress = await loadGettingStartedProgress(locals.user);
		const { mode } = resolveCardMode({
			pref: locals.user.gettingStarted as GettingStartedPref,
			seenAt: locals.user.gettingStartedSeenAt,
			completedOn: locals.user.gettingStartedCompletedOn,
			complete: progress.complete,
			today: localDateISO()
		});
		gettingStarted = {
			showing: mode !== 'hidden',
			complete: progress.complete,
			doneCount: progress.doneCount
		};
	}

	return {
		user: locals.user,
		gettingStarted,
		companions,
		archivedCompanions,
		reminderUndoDefault: REMINDER_UNDO_SECONDS_DEFAULT,
		mailEnabled: isMailEnabled(),
		ntfyEnabled: isNtfyEnabled(),
		calendarFeedAvailable: CALENDAR_FEED_ENABLED,
		calendarFeedEnabled: calUser?.calendarFeedToken != null,
		apiTokensAvailable: API_TOKENS_ENABLED,
		apiAccessEnabled: locals.user.apiAccessEnabled,
		apiTokens: API_TOKENS_ENABLED ? await listApiTokens(locals.user.id) : [],
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
			sameSite: 'lax',
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
			sameSite: 'lax',
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

	gettingStartedHide: async ({ locals }) => {
		if (!locals.user) redirect(302, '/auth/login');
		return handleGettingStartedPref(locals.user, 'dismissed', locals.locale);
	},

	gettingStartedShow: async ({ locals }) => {
		if (!locals.user) redirect(302, '/auth/login');
		return handleGettingStartedPref(locals.user, 'reopened', locals.locale);
	},

	defaultRecurrence: async ({ request, locals }) => {
		if (!locals.user) redirect(302, '/auth/login');
		return handleDefaultRecurrenceUpdate(locals.user.id, request, locals.locale);
	},

	notifications: async ({ request, locals }) => {
		if (!locals.user) redirect(302, '/auth/login');
		return handleNotificationsUpdate(locals.user.id, locals.user.role, request, locals.locale);
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

	apiTokenCreate: async ({ request, locals }) => {
		if (!locals.user) return fail(401);
		return handleApiTokenCreate(locals.user.id, request, locals.locale);
	},

	apiTokenRevoke: async ({ request, locals }) => {
		if (!locals.user) return fail(401);
		return handleApiTokenRevoke(locals.user.id, request, locals.locale);
	},

	apiTokenRotate: async ({ request, locals }) => {
		if (!locals.user) return fail(401);
		return handleApiTokenRotate(locals.user.id, request, locals.locale);
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
