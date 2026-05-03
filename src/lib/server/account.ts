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
import { t } from '$lib/i18n';
import type { Locale } from '$lib/i18n';
import { REMINDER_UNDO_PRESETS, REMINDER_UNDO_DEFAULT_SENTINEL } from '$lib/server/env';

export async function handleAccountUpdate(
	userId: string,
	request: Request,
	cookies: Cookies,
	locale: Locale
) {
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
		return fail(400, { accountError: t(locale, 'error.displayNameAndUsernameRequired') });
	}
	if (!/^[a-z0-9_-]+$/.test(username)) {
		return fail(400, {
			accountError: t(locale, 'error.invalidUsernameFormat')
		});
	}

	const existing = await db.query.users.findFirst({
		where: eq(schema.users.username, username)
	});
	if (existing && existing.id !== userId) {
		return fail(400, { accountError: t(locale, 'error.usernameAlreadyTakenAccount') });
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
			return fail(400, { accountError: t(locale, 'error.noPasswordSet') });
		}
		const valid = await bcrypt.compare(currentPassword, user.passwordHash);
		if (!valid) {
			return fail(400, { accountError: t(locale, 'error.currentPasswordIncorrect') });
		}
		if (!newPassword) {
			return fail(400, { accountError: t(locale, 'error.newPasswordRequired') });
		}
		if (newPassword.length < 8) {
			return fail(400, { accountError: t(locale, 'error.newPasswordTooShort') });
		}
		if (newPassword.length > 128) {
			return fail(400, { accountError: t(locale, 'error.passwordTooLong') });
		}
		if (newPassword !== confirmPassword) {
			return fail(400, { accountError: t(locale, 'error.passwordsMismatch') });
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

export async function handleReminderUndoUpdate(userId: string, request: Request, locale: Locale) {
	const data = await request.formData();
	const raw = String(data.get('reminderUndoSeconds') ?? '');

	let value: number | null;
	if (raw === '' || raw === REMINDER_UNDO_DEFAULT_SENTINEL) {
		value = null;
	} else {
		const n = Number(raw);
		if (!Number.isInteger(n) || !REMINDER_UNDO_PRESETS.includes(n)) {
			return fail(400, { reminderUndoError: t(locale, 'error.invalidReminderUndo') });
		}
		value = n;
	}

	await db
		.update(schema.users)
		.set({ reminderUndoSeconds: value })
		.where(eq(schema.users.id, userId));

	return { reminderUndoSuccess: true };
}
