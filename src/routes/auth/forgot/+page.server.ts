import { fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { t } from '$lib/i18n';
import { db, schema } from '$lib/server/db';
import { eq } from 'drizzle-orm';
import { isMailEnabled, sendMail } from '$lib/server/mail';
import { buildResetEmail } from '$lib/server/mail/templates';
import { createResetToken, cleanupExpiredResetTokens } from '$lib/server/auth/password-reset';

// In-process per-IP limiter, same caveats as the login limiter: state resets on
// restart, single-instance only. A DB-backed per-user cooldown lives in
// createResetToken and survives restarts.
const forgotAttempts = new Map<string, { count: number; resetAt: number }>();
const MAX_ATTEMPTS = 5;
const WINDOW_MS = 15 * 60 * 1000;
const CLEANUP_INTERVAL_MS = 5 * 60 * 1000;

let lastCleanup = Date.now();

function checkRateLimit(ip: string): boolean {
	const now = Date.now();

	if (now - lastCleanup > CLEANUP_INTERVAL_MS) {
		for (const [key, val] of forgotAttempts) {
			if (now > val.resetAt) forgotAttempts.delete(key);
		}
		lastCleanup = now;
	}

	const record = forgotAttempts.get(ip);
	if (!record || now > record.resetAt) {
		forgotAttempts.set(ip, { count: 1, resetAt: now + WINDOW_MS });
		return true;
	}
	if (record.count >= MAX_ATTEMPTS) return false;
	record.count++;
	return true;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const load: PageServerLoad = async ({ locals }) => {
	if (!isMailEnabled()) redirect(302, '/auth/login');
	if (locals.user) redirect(302, '/');
};

export const actions: Actions = {
	default: async ({ request, getClientAddress, locals, url }) => {
		const locale = locals.locale;
		if (!isMailEnabled()) redirect(302, '/auth/login');

		if (!checkRateLimit(getClientAddress())) {
			return fail(429, { error: t(locale, 'error.tooManyResetRequests') });
		}

		const data = await request.formData();
		const email = String(data.get('email') ?? '')
			.trim()
			.toLowerCase();

		if (!email) return fail(400, { error: t(locale, 'error.emailRequired') });
		if (!EMAIL_RE.test(email)) return fail(400, { error: t(locale, 'error.emailInvalid') });

		cleanupExpiredResetTokens().catch((err) =>
			console.error('[mail] reset token cleanup failed:', err)
		);

		// Enumeration safety: every outcome below this point returns the same
		// generic success. The send is fire-and-forget so response timing does not
		// reveal whether the address matched an account.
		const user = await db.query.users.findFirst({ where: eq(schema.users.email, email) });
		if (user && user.isActive && user.passwordHash && user.email) {
			const userId = user.id;
			const token = await createResetToken(userId);
			if (token) {
				const link = `${url.origin}/auth/reset?token=${encodeURIComponent(token)}`;
				const message = buildResetEmail(
					user.locale,
					{ displayName: user.displayName, username: user.username, email: user.email },
					link
				);
				sendMail(message).catch((err) =>
					console.error(`[mail] reset email to user ${userId} failed:`, err)
				);
			}
		}

		return { success: true };
	}
};
