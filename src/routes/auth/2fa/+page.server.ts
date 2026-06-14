import { fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { db, schema } from '$lib/server/db';
import { and, eq, isNull } from 'drizzle-orm';
import { t } from '$lib/i18n';
import {
	createSession,
	generateSessionToken,
	SESSION_COOKIE_NAME,
	makeSessionCookieOptions
} from '$lib/server/auth/session';
import { isSecureRequest } from '$lib/server/auth';
import { readPendingMfaCookie, clearPendingMfaCookie } from '$lib/server/auth/two-factor';
import { decryptSecret } from '$lib/server/auth/totp-crypto';
import { verifyCode, hashBackupCode } from '$lib/server/auth/totp';
import { checkRateLimit, clearRateLimit } from '$lib/server/auth/rate-limit';

export const load: PageServerLoad = async ({ cookies }) => {
	const pending = await readPendingMfaCookie(cookies);
	if (!pending) redirect(302, '/auth/login');
	return {};
};

export const actions: Actions = {
	default: async ({ request, cookies, getClientAddress, locals }) => {
		const locale = locals.locale;
		const secure = isSecureRequest(request);
		const pending = await readPendingMfaCookie(cookies);
		if (!pending) redirect(302, '/auth/login');

		const rlKey = `2fa:${pending.userId}:${getClientAddress()}`;
		if (!checkRateLimit(rlKey)) {
			clearPendingMfaCookie(cookies, secure);
			return fail(429, { error: t(locale, 'error.tooManyLoginAttempts') });
		}

		const input = String((await request.formData()).get('code') ?? '').trim();
		const user = await db.query.users.findFirst({ where: eq(schema.users.id, pending.userId) });
		if (!user || !user.totpSecret || !user.isActive) redirect(302, '/auth/login');

		let ok = false;
		if (/^\d{6}$/.test(input.replace(/\s/g, ''))) {
			const res = verifyCode(decryptSecret(user.totpSecret), input, {
				lastStep: user.totpLastStep ?? undefined
			});
			if (res.valid) {
				ok = true;
				await db
					.update(schema.users)
					.set({ totpLastStep: res.step })
					.where(eq(schema.users.id, user.id));
			}
		} else if (input) {
			const hash = hashBackupCode(input);
			const code = await db.query.totpBackupCodes.findFirst({
				where: and(
					eq(schema.totpBackupCodes.userId, user.id),
					eq(schema.totpBackupCodes.codeHash, hash),
					isNull(schema.totpBackupCodes.usedAt)
				)
			});
			if (code) {
				ok = true;
				await db
					.update(schema.totpBackupCodes)
					.set({ usedAt: new Date() })
					.where(eq(schema.totpBackupCodes.id, code.id));
			}
		}

		if (!ok) return fail(401, { error: t(locale, 'page.twofa.invalidCode') });

		clearRateLimit(rlKey);
		clearPendingMfaCookie(cookies, secure);
		const token = generateSessionToken();
		const session = await createSession(token, user.id);
		cookies.set(SESSION_COOKIE_NAME, token, makeSessionCookieOptions(session.expiresAt, secure));
		redirect(302, user.role === 'caretaker' ? '/care' : '/');
	}
};
