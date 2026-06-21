import { error, redirect } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { DEMO_MODE } from '$lib/server/env';
import { demoUserIdForRole } from '$lib/server/demo';
import {
	generateSessionToken,
	createSession,
	validateSessionToken,
	invalidateSession,
	SESSION_COOKIE_NAME,
	makeSessionCookieOptions
} from '$lib/server/auth/session';
import { isSecureRequest } from '$lib/server/auth';
import { checkRateLimit } from '$lib/server/auth/rate-limit';

export const POST: RequestHandler = async ({ request, cookies, getClientAddress }) => {
	if (!DEMO_MODE) error(404, 'Not found');

	const ip = getClientAddress();
	if (!checkRateLimit(`demo:${ip}`, 30)) error(429, 'Too many requests');

	const form = await request.formData();
	const role = String(form.get('role') ?? '');
	const userId = demoUserIdForRole(role);
	if (!userId) error(400, 'Invalid role');

	// Switching roles: drop the caller's previous session so role-hopping doesn't
	// accumulate orphan session rows over the life of the demo.
	const prevToken = cookies.get(SESSION_COOKIE_NAME);
	if (prevToken) {
		const existing = await validateSessionToken(prevToken);
		if (existing) await invalidateSession(existing.session.id);
	}

	const token = generateSessionToken();
	const session = await createSession(token, userId);
	cookies.set(
		SESSION_COOKIE_NAME,
		token,
		makeSessionCookieOptions(session.expiresAt, isSecureRequest(request))
	);

	redirect(303, role === 'caretaker' ? '/care' : '/');
};
