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
import {
	REMINDER_UNDO_PRESETS,
	REMINDER_UNDO_DEFAULT_SENTINEL,
	REMINDER_UNDO_SECONDS_DEFAULT
} from '$lib/server/env';
import { parseRecurrenceUnit } from '$lib/server/validation';
import { NTFY_TOPIC_RE, isNtfyEnabled, sendNtfy } from '$lib/server/notify/ntfy';
import { isMailEnabled, sendMail } from '$lib/server/mail';
import { buildTestEmail } from '$lib/server/mail/templates';

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
	const email =
		String(data.get('email') ?? '')
			.trim()
			.toLowerCase() || null;
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

	if (email) {
		const emailConflict = await db.query.users.findFirst({
			where: eq(schema.users.email, email)
		});
		if (emailConflict && emailConflict.id !== userId) {
			return fail(400, { accountError: t(locale, 'error.emailAlreadyTaken') });
		}
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

	try {
		await db.update(schema.users).set(updates).where(eq(schema.users.id, userId));
	} catch (err) {
		if (
			err instanceof Error &&
			(err as Error & { code?: string }).code === 'SQLITE_CONSTRAINT_UNIQUE' &&
			err.message.includes('users.email')
		) {
			return fail(400, { accountError: t(locale, 'error.emailAlreadyTaken') });
		}
		throw err;
	}

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
		// Accept any preset OR the env-resolved site default. The dropdown
		// merges the env default into the list, so a non-preset env value
		// must round-trip through this validator.
		const allowed = REMINDER_UNDO_PRESETS.includes(n) || n === REMINDER_UNDO_SECONDS_DEFAULT;
		if (!Number.isInteger(n) || !allowed) {
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

export async function handleDefaultRecurrenceUpdate(
	userId: string,
	request: Request,
	locale: Locale
) {
	const data = await request.formData();
	const raw = String(data.get('defaultRecurrenceUnit') ?? '');

	let value: 'day' | 'week' | 'month' | 'year' | null;
	if (raw === '' || raw === 'system') {
		value = null;
	} else {
		const parsed = parseRecurrenceUnit(raw);
		if (!parsed) {
			return fail(400, { defaultRecurrenceError: t(locale, 'error.invalidDefaultRecurrence') });
		}
		value = parsed;
	}

	await db
		.update(schema.users)
		.set({ defaultRecurrenceUnit: value })
		.where(eq(schema.users.id, userId));

	return { defaultRecurrenceSuccess: true };
}

export async function handleNotificationsUpdate(userId: string, request: Request, locale: Locale) {
	const data = await request.formData();
	const notifyReminderEmail = data.get('notifyReminderEmail') === 'on';
	const notifyShiftEmail = data.get('notifyShiftEmail') === 'on';
	const rawTopic = String(data.get('ntfyTopic') ?? '').trim();
	const ntfyTopic = rawTopic || null;

	if (ntfyTopic && !NTFY_TOPIC_RE.test(ntfyTopic)) {
		return fail(400, { notificationsError: t(locale, 'error.invalidNtfyTopic') });
	}

	await db
		.update(schema.users)
		.set({ notifyReminderEmail, notifyShiftEmail, ntfyTopic })
		.where(eq(schema.users.id, userId));

	return { notificationsSuccess: true };
}

// Test sends are immediate (not via the outbox) so the user gets instant
// feedback. Light per-user cooldown to keep a stuck double-click from
// hammering SMTP or ntfy. In-process state, single-instance assumption.
const TEST_COOLDOWN_MS = 10 * 1000;
const lastTestAt = new Map<string, number>();

function testOnCooldown(key: string): boolean {
	const now = Date.now();
	const last = lastTestAt.get(key) ?? 0;
	if (now - last < TEST_COOLDOWN_MS) return true;
	lastTestAt.set(key, now);
	return false;
}

export async function handleTestEmail(
	user: { id: string; displayName: string; email: string | null; locale: Locale },
	locale: Locale
) {
	if (!isMailEnabled() || !user.email) {
		return fail(400, {
			notificationsTestError: t(locale, 'page.settings.testFailed', {
				error: 'email unavailable'
			})
		});
	}
	if (testOnCooldown(`${user.id}:email`)) {
		return fail(429, { notificationsTestError: t(locale, 'error.testCooldown') });
	}
	try {
		await sendMail(
			buildTestEmail(user.locale, { displayName: user.displayName, email: user.email })
		);
	} catch (err) {
		const msg = err instanceof Error ? err.message : String(err);
		return fail(502, {
			notificationsTestError: t(locale, 'page.settings.testFailed', { error: msg })
		});
	}
	return { notificationsTestSuccess: true };
}

export async function handleTestNtfy(
	user: { id: string; displayName: string; locale: Locale },
	locale: Locale
) {
	const row = await db.query.users.findFirst({
		where: eq(schema.users.id, user.id),
		columns: { ntfyTopic: true }
	});
	if (!isNtfyEnabled() || !row?.ntfyTopic) {
		return fail(400, {
			notificationsTestError: t(locale, 'page.settings.testFailed', {
				error: 'ntfy unavailable'
			})
		});
	}
	if (testOnCooldown(`${user.id}:ntfy`)) {
		return fail(429, { notificationsTestError: t(locale, 'error.testCooldown') });
	}
	try {
		await sendNtfy(row.ntfyTopic, {
			title: t(user.locale, 'email.test.subject'),
			message: t(user.locale, 'email.test.body')
		});
	} catch (err) {
		const msg = err instanceof Error ? err.message : String(err);
		return fail(502, {
			notificationsTestError: t(locale, 'page.settings.testFailed', { error: msg })
		});
	}
	return { notificationsTestSuccess: true };
}
