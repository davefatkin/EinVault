import type { RequestEvent } from '@sveltejs/kit';
import {
	validateSessionToken,
	SESSION_COOKIE_NAME,
	makeSessionCookieOptions,
	makeBlankCookieOptions
} from './session';

export function isSecureRequest(request: Request): boolean {
	const proto = request.headers.get('x-forwarded-proto');
	if (proto) return proto === 'https';
	return new URL(request.url).protocol === 'https:';
}

export async function validateAuth(event: RequestEvent, { refreshCookie = true } = {}) {
	const token = event.cookies.get(SESSION_COOKIE_NAME);
	if (!token) return { session: null, user: null };

	const result = await validateSessionToken(token);
	if (!result) {
		if (refreshCookie)
			event.cookies.set(
				SESSION_COOKIE_NAME,
				'',
				makeBlankCookieOptions(isSecureRequest(event.request))
			);
		return { session: null, user: null };
	}

	const { session, user } = result;
	if (refreshCookie) {
		const secure = isSecureRequest(event.request);
		event.cookies.set(
			SESSION_COOKIE_NAME,
			token,
			makeSessionCookieOptions(session.expiresAt, secure)
		);
	}

	return {
		session: { id: session.id, userId: session.userId, fresh: false, expiresAt: session.expiresAt },
		user: {
			id: user.id,
			username: user.username,
			displayName: user.displayName,
			role: user.role as 'admin' | 'member' | 'caretaker',
			isActive: user.isActive,
			theme: (user.theme ?? 'system') as 'light' | 'dark' | 'system',
			locale: (user.locale ?? 'en') as 'en' | 'it' | 'de' | 'es' | 'fr' | 'pt',
			email: user.email ?? null,
			phone: user.phone ?? null,
			reminderUndoSeconds: user.reminderUndoSeconds ?? null
		}
	};
}
