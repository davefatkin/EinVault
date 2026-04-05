import { fail, redirect, error } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { db, schema } from '$lib/server/db';
import {
	generateSessionToken,
	createSession,
	SESSION_COOKIE_NAME,
	makeSessionCookieOptions
} from '$lib/server/auth/session';
import { isSecureRequest } from '$lib/server/auth';
import { generateId } from '$lib/server/utils';
import bcrypt from 'bcryptjs';
import { count } from 'drizzle-orm';
import { t, DEFAULT_LOCALE } from '$lib/i18n';

export const load: PageServerLoad = async () => {
	try {
		await db.$count(schema.users);
	} catch {
		error(503, t(DEFAULT_LOCALE, 'error.databaseNotReady'));
	}
	return {};
};

export const actions: Actions = {
	default: async ({ request, cookies }) => {
		const data = await request.formData();
		const displayName = String(data.get('displayName') ?? '').trim();
		const username = String(data.get('username') ?? '')
			.trim()
			.toLowerCase();
		const password = String(data.get('password') ?? '');
		const confirmPassword = String(data.get('confirmPassword') ?? '');

		if (!displayName || !username || !password || !confirmPassword) {
			return fail(400, { error: t(DEFAULT_LOCALE, 'error.allFieldsRequired') });
		}
		if (!/^[a-z0-9_-]+$/.test(username)) {
			return fail(400, {
				error: t(DEFAULT_LOCALE, 'error.invalidUsernameFormat')
			});
		}
		if (password.length < 8) {
			return fail(400, { error: t(DEFAULT_LOCALE, 'error.passwordTooShort') });
		}
		if (password.length > 128) {
			return fail(400, { error: t(DEFAULT_LOCALE, 'error.passwordTooLong') });
		}
		if (password !== confirmPassword) {
			return fail(400, { error: t(DEFAULT_LOCALE, 'error.passwordsMismatch') });
		}

		const passwordHash = await bcrypt.hash(password, 12);
		const userId = generateId(15);

		// Wrap user count check and insert in a transaction to prevent TOCTOU race
		const inserted = db.transaction((tx) => {
			const [{ value }] = tx.select({ value: count() }).from(schema.users).all();
			if (value > 0) return false;
			tx.insert(schema.users)
				.values({
					id: userId,
					username,
					displayName,
					passwordHash,
					role: 'admin'
				})
				.run();
			return true;
		});

		if (!inserted) {
			return fail(403, { error: t(DEFAULT_LOCALE, 'error.setupAlreadyCompleted') });
		}

		const token = generateSessionToken();
		const session = await createSession(token, userId);

		cookies.set(
			SESSION_COOKIE_NAME,
			token,
			makeSessionCookieOptions(session.expiresAt, isSecureRequest(request))
		);

		redirect(302, '/');
	}
};
