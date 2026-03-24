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

export const load: PageServerLoad = async () => {
	try {
		await db.$count(schema.users);
	} catch {
		error(503, 'Database not ready. Run `npm run db:generate` then restart the dev server.');
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
			return fail(400, { error: 'All fields are required.' });
		}
		if (!/^[a-z0-9_-]+$/.test(username)) {
			return fail(400, {
				error: 'Username may only contain lowercase letters, numbers, hyphens and underscores.'
			});
		}
		if (password.length < 8) {
			return fail(400, { error: 'Password must be at least 8 characters.' });
		}
		if (password.length > 128) {
			return fail(400, { error: 'Password must be 128 characters or fewer.' });
		}
		if (password !== confirmPassword) {
			return fail(400, { error: 'Passwords do not match.' });
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
			return fail(403, { error: 'Setup has already been completed.' });
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
