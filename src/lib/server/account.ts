import { fail } from '@sveltejs/kit';
import { db, schema } from '$lib/server/db';
import { eq } from 'drizzle-orm';
import bcrypt from 'bcryptjs';
import {
	invalidateAllUserSessions,
	generateSessionToken,
	createSession,
	SESSION_COOKIE_NAME,
	makeSessionCookieOptions
} from '$lib/server/auth/session';
import { isSecureRequest } from '$lib/server/auth';
import type { Cookies } from '@sveltejs/kit';

export async function handleAccountUpdate(userId: string, request: Request, cookies: Cookies) {
	const data = await request.formData();
	const displayName = String(data.get('displayName') ?? '').trim();
	const username = String(data.get('username') ?? '')
		.trim()
		.toLowerCase();
	const email = String(data.get('email') ?? '').trim() || null;
	const phone = String(data.get('phone') ?? '').trim() || null;
	const currentPassword = String(data.get('currentPassword') ?? '');
	const newPassword = String(data.get('newPassword') ?? '');
	const confirmPassword = String(data.get('confirmPassword') ?? '');

	if (!displayName || !username) {
		return fail(400, { accountError: 'Display name and username are required.' });
	}
	if (!/^[a-z0-9_-]+$/.test(username)) {
		return fail(400, {
			accountError: 'Username may only contain lowercase letters, numbers, hyphens and underscores.'
		});
	}

	const existing = await db.query.users.findFirst({
		where: eq(schema.users.username, username)
	});
	if (existing && existing.id !== userId) {
		return fail(400, { accountError: 'That username is already taken.' });
	}

	const updates: Partial<typeof schema.users.$inferInsert> = {
		displayName,
		username,
		email,
		phone
	};

	if (currentPassword) {
		const user = await db.query.users.findFirst({ where: eq(schema.users.id, userId) });
		if (!user?.passwordHash) {
			return fail(400, { accountError: 'No password is set on this account.' });
		}
		const valid = await bcrypt.compare(currentPassword, user.passwordHash);
		if (!valid) {
			return fail(400, { accountError: 'Current password is incorrect.' });
		}
		if (!newPassword) {
			return fail(400, { accountError: 'New password is required.' });
		}
		if (newPassword.length < 8) {
			return fail(400, { accountError: 'New password must be at least 8 characters.' });
		}
		if (newPassword.length > 128) {
			return fail(400, { accountError: 'Password must be 128 characters or fewer.' });
		}
		if (newPassword !== confirmPassword) {
			return fail(400, { accountError: 'Passwords do not match.' });
		}
		updates.passwordHash = await bcrypt.hash(newPassword, 12);
	}

	await db.update(schema.users).set(updates).where(eq(schema.users.id, userId));

	if (updates.passwordHash) {
		await invalidateAllUserSessions(userId);
		const token = generateSessionToken();
		const session = await createSession(token, userId);
		cookies.set(
			SESSION_COOKIE_NAME,
			token,
			makeSessionCookieOptions(session.expiresAt, isSecureRequest(request))
		);
	}

	return { accountSuccess: true };
}
