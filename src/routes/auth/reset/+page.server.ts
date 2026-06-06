import { fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { t } from '$lib/i18n';
import { db, schema } from '$lib/server/db';
import { eq } from 'drizzle-orm';
import bcrypt from 'bcryptjs';
import { invalidateAllUserSessions } from '$lib/server/auth/session';
import { validateResetToken, consumeUserResetTokens } from '$lib/server/auth/password-reset';

export const load: PageServerLoad = async ({ url, locals }) => {
	if (locals.user) redirect(302, '/');

	const token = url.searchParams.get('token') ?? '';
	const valid = token ? (await validateResetToken(token)) !== null : false;
	return { valid };
};

export const actions: Actions = {
	default: async ({ request, locals }) => {
		const locale = locals.locale;

		const data = await request.formData();
		const token = String(data.get('token') ?? '');
		const newPassword = String(data.get('newPassword') ?? '');
		const confirmPassword = String(data.get('confirmPassword') ?? '');

		// Re-validate in the action: the load-time check is advisory only, and the
		// token may have expired or been consumed between render and submit.
		const result = token ? await validateResetToken(token) : null;
		if (!result) {
			return fail(400, { error: t(locale, 'page.reset.invalid') });
		}

		if (newPassword.length < 8) {
			return fail(400, { error: t(locale, 'error.passwordTooShort') });
		}
		if (newPassword.length > 128) {
			return fail(400, { error: t(locale, 'error.passwordTooLong') });
		}
		if (newPassword !== confirmPassword) {
			return fail(400, { error: t(locale, 'error.passwordsMismatch') });
		}

		const passwordHash = await bcrypt.hash(newPassword, 12);
		await db.update(schema.users).set({ passwordHash }).where(eq(schema.users.id, result.user.id));

		// Single-use + lock out anyone holding a stolen session.
		await consumeUserResetTokens(result.user.id);
		await invalidateAllUserSessions(result.user.id);

		return { success: true };
	}
};
