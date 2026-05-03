import { error, redirect } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import type { IDToken } from 'openid-client';
import {
	isOidcEnabled,
	discoverOidcClient,
	handleCallback,
	evaluateRole,
	isAdminGroupsConfigured
} from '$lib/server/auth/oidc';
import { readAndClearOidcStateCookie } from '$lib/server/auth/oidc-state';
import { isSecureRequest } from '$lib/server/auth';
import {
	generateSessionToken,
	createSession,
	SESSION_COOKIE_NAME,
	makeSessionCookieOptions
} from '$lib/server/auth/session';
import { db, schema } from '$lib/server/db';
import { eq, and } from 'drizzle-orm';
import { generateId } from '$lib/server/utils';
import { t } from '$lib/i18n';
import { env } from '$env/dynamic/private';

// Same in-process rate limiter pattern as the password login route.
const callbackAttempts = new Map<string, { count: number; resetAt: number }>();
const MAX_ATTEMPTS = 10;
const WINDOW_MS = 15 * 60 * 1000;
const CLEANUP_INTERVAL_MS = 5 * 60 * 1000;

let lastCleanup = Date.now();

function checkRateLimit(ip: string): boolean {
	const now = Date.now();
	if (now - lastCleanup > CLEANUP_INTERVAL_MS) {
		for (const [key, val] of callbackAttempts) {
			if (now > val.resetAt) callbackAttempts.delete(key);
		}
		lastCleanup = now;
	}
	const record = callbackAttempts.get(ip);
	if (!record || now > record.resetAt) {
		callbackAttempts.set(ip, { count: 1, resetAt: now + WINDOW_MS });
		return true;
	}
	if (record.count >= MAX_ATTEMPTS) return false;
	record.count++;
	return true;
}

function sanitizeUsername(raw: string): string {
	return raw
		.toLowerCase()
		.replace(/[^a-z0-9_-]+/g, '-')
		.replace(/-+/g, '-')
		.replace(/^-+|-+$/g, '');
}

export const GET: RequestHandler = async ({ url, cookies, locals, request, getClientAddress }) => {
	if (!isOidcEnabled()) error(404);

	const ip = getClientAddress();
	const locale = locals.locale;
	const secure = isSecureRequest(request);

	if (!checkRateLimit(ip)) {
		error(429, t(locale, 'error.tooManyLoginAttempts'));
	}

	const stateCookie = await readAndClearOidcStateCookie(cookies, secure);
	if (!stateCookie) {
		redirect(302, '/auth/login?error=oidc_invalid_state');
	}

	// Verify URL state matches cookie state before exchanging the code.
	const urlState = url.searchParams.get('state');
	if (!urlState || urlState !== stateCookie.state) {
		redirect(302, '/auth/login?error=oidc_invalid_state');
	}

	let idTokenClaims: IDToken;
	let idToken: string;

	try {
		const discovered = await discoverOidcClient();
		({ idTokenClaims, idToken } = await handleCallback(
			discovered,
			url,
			stateCookie.codeVerifier,
			stateCookie.state,
			stateCookie.nonce
		));
	} catch (err) {
		console.error('[oidc] token exchange failed:', err);
		redirect(302, '/auth/login?error=oidc_exchange_failed');
	}

	const sub = idTokenClaims.sub;
	const iss = idTokenClaims.iss;
	const email: string | undefined =
		typeof idTokenClaims.email === 'string' ? idTokenClaims.email.toLowerCase() : undefined;
	const emailVerified = idTokenClaims.email_verified === true;
	const preferredUsername: string | undefined =
		typeof (idTokenClaims as Record<string, unknown>)['preferred_username'] === 'string'
			? ((idTokenClaims as Record<string, unknown>)['preferred_username'] as string)
			: undefined;
	const displayName: string | undefined =
		typeof idTokenClaims.name === 'string' ? idTokenClaims.name : undefined;

	const defaultRoleEnv = env.OIDC_DEFAULT_ROLE === 'caretaker' ? 'caretaker' : 'member';
	const adminGroupsConfigured = isAdminGroupsConfigured();

	// Linking algorithm — synchronous transaction.
	type TxResult =
		| { kind: 'ok'; userId: string; role: 'admin' | 'member' | 'caretaker' }
		| { kind: 'disabled' }
		| { kind: 'not_provisioned' };

	const txResult: TxResult = db.transaction((tx) => {
		// 1. Find by OIDC subject.
		const byOidc = tx
			.select()
			.from(schema.users)
			.where(and(eq(schema.users.oidcIssuer, iss), eq(schema.users.oidcSubject, sub)))
			.get();

		if (byOidc) {
			if (!byOidc.isActive) return { kind: 'disabled' };
			// Only re-evaluate role when admin groups are configured; otherwise the IdP isn't
			// the source of truth for roles and we preserve whatever was set locally.
			let role: 'admin' | 'member' | 'caretaker' = byOidc.role;
			if (adminGroupsConfigured) {
				role = evaluateRole(idTokenClaims, byOidc.role);
				if (role !== byOidc.role) {
					tx.update(schema.users).set({ role }).where(eq(schema.users.id, byOidc.id)).run();
				}
			}
			tx.update(schema.users)
				.set({ lastLoginAt: new Date() })
				.where(eq(schema.users.id, byOidc.id))
				.run();
			console.info(`[oidc] linked login sub=${sub} userId=${byOidc.id}`);
			return { kind: 'ok', userId: byOidc.id, role };
		}

		// 2. Find by verified email.
		if (email && emailVerified) {
			const byEmail = tx.select().from(schema.users).where(eq(schema.users.email, email)).get();

			if (byEmail) {
				if (!byEmail.isActive) return { kind: 'disabled' };
				tx.update(schema.users)
					.set({ oidcSubject: sub, oidcIssuer: iss, lastLoginAt: new Date() })
					.where(eq(schema.users.id, byEmail.id))
					.run();
				let role: 'admin' | 'member' | 'caretaker' = byEmail.role;
				if (adminGroupsConfigured) {
					role = evaluateRole(idTokenClaims, byEmail.role);
					if (role !== byEmail.role) {
						tx.update(schema.users).set({ role }).where(eq(schema.users.id, byEmail.id)).run();
					}
				}
				console.info(`[oidc] email-linked login sub=${sub} userId=${byEmail.id}`);
				return { kind: 'ok', userId: byEmail.id, role };
			}
		}

		// 3. Auto-signup.
		if (env.OIDC_ALLOW_SIGNUP !== 'true') {
			return { kind: 'not_provisioned' };
		}

		// Build a username candidate.
		let usernameBase = '';
		if (preferredUsername) {
			usernameBase = sanitizeUsername(preferredUsername);
		} else if (email) {
			usernameBase = sanitizeUsername(email.split('@')[0]);
		}
		if (!usernameBase) {
			usernameBase =
				'oidc-' +
				sub
					.slice(0, 8)
					.toLowerCase()
					.replace(/[^a-z0-9]/g, '');
		}

		// Resolve collisions with numeric suffix.
		let username = usernameBase;
		let suffix = 2;
		while (
			tx
				.select({ id: schema.users.id })
				.from(schema.users)
				.where(eq(schema.users.username, username))
				.get()
		) {
			username = usernameBase + suffix;
			suffix++;
		}

		const newUserId = generateId(15);
		const role = evaluateRole(idTokenClaims, defaultRoleEnv);

		tx.insert(schema.users)
			.values({
				id: newUserId,
				username,
				displayName: displayName || username,
				passwordHash: null,
				role,
				email: email || null,
				oidcSubject: sub,
				oidcIssuer: iss,
				lastLoginAt: new Date()
			})
			.run();

		console.info(`[oidc] created user sub=${sub} userId=${newUserId} username=${username}`);
		return { kind: 'ok', userId: newUserId, role };
	});

	if (txResult.kind === 'disabled') {
		redirect(302, '/auth/login?error=oidc_account_disabled');
	}

	if (txResult.kind === 'not_provisioned') {
		redirect(302, '/auth/login?error=oidc_not_provisioned');
	}

	const { userId, role } = txResult;

	const token = generateSessionToken();
	const session = await createSession(token, userId, { oidcIdTokenHint: idToken });

	cookies.set(SESSION_COOKIE_NAME, token, makeSessionCookieOptions(session.expiresAt, secure));

	const returnTo =
		stateCookie.returnTo && stateCookie.returnTo !== '/' ? stateCookie.returnTo : null;
	if (returnTo) {
		redirect(302, returnTo);
	}

	redirect(302, role === 'caretaker' ? '/care' : '/');
};
