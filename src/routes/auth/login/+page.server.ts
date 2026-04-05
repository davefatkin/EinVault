import { fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { t } from '$lib/i18n';
import { db, schema } from '$lib/server/db';
import {
	generateSessionToken,
	createSession,
	SESSION_COOKIE_NAME,
	makeSessionCookieOptions
} from '$lib/server/auth/session';
import { isSecureRequest } from '$lib/server/auth';
import { eq } from 'drizzle-orm';
import bcrypt from 'bcryptjs';

// NOTE: This rate limiter is in-process memory only. State resets on server restart and
// does not coordinate across multiple processes. It is intentional for a single-instance
// deployment; revisit before horizontal scaling.
const loginAttempts = new Map<string, { count: number; resetAt: number }>();
const MAX_ATTEMPTS = 10;
const WINDOW_MS = 15 * 60 * 1000;
const CLEANUP_INTERVAL_MS = 5 * 60 * 1000;

let lastCleanup = Date.now();

function checkRateLimit(ip: string): boolean {
	const now = Date.now();

	if (now - lastCleanup > CLEANUP_INTERVAL_MS) {
		for (const [key, val] of loginAttempts) {
			if (now > val.resetAt) loginAttempts.delete(key);
		}
		lastCleanup = now;
	}

	const record = loginAttempts.get(ip);
	if (!record || now > record.resetAt) {
		loginAttempts.set(ip, { count: 1, resetAt: now + WINDOW_MS });
		return true;
	}
	if (record.count >= MAX_ATTEMPTS) return false;
	record.count++;
	return true;
}

function clearRateLimit(ip: string) {
	loginAttempts.delete(ip);
}

export const load: PageServerLoad = async ({ locals }) => {
	if (locals.user) {
		if (locals.user.role === 'caretaker') redirect(302, '/care');
		redirect(302, '/');
	}
	return {};
};

export const actions: Actions = {
	default: async ({ request, cookies, getClientAddress, locals }) => {
		const ip = getClientAddress();
		const locale = locals.locale;

		if (!checkRateLimit(ip)) {
			return fail(429, { error: t(locale, 'error.tooManyLoginAttempts') });
		}

		const data = await request.formData();
		const username = String(data.get('username') ?? '')
			.trim()
			.toLowerCase();
		const password = String(data.get('password') ?? '');

		if (!username || !password) {
			return fail(400, { error: t(locale, 'error.credentialsRequired') });
		}

		const user = await db.query.users.findFirst({
			where: eq(schema.users.username, username)
		});

		const isValid = user?.passwordHash
			? await bcrypt.compare(password, user.passwordHash)
			: await bcrypt.compare(
					password,
					'$2b$12$LGIYfMEhELhAE97Ap23EBuwZ0s.HS0ckiFtQqv3TaTkK6uu0e1Gim'
				);

		if (!user || !isValid || !user.isActive) {
			return fail(401, { error: t(locale, 'error.invalidCredentials') });
		}

		clearRateLimit(ip);

		await db
			.update(schema.users)
			.set({ lastLoginAt: new Date() })
			.where(eq(schema.users.id, user.id));

		const token = generateSessionToken();
		const session = await createSession(token, user.id);

		cookies.set(
			SESSION_COOKIE_NAME,
			token,
			makeSessionCookieOptions(session.expiresAt, isSecureRequest(request))
		);

		if (user.role === 'caretaker') redirect(302, '/care');
		redirect(302, '/');
	}
};
