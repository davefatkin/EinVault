import { error, redirect } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import * as client from 'openid-client';
import { isOidcEnabled, discoverOidcClient, getOidcConfig } from '$lib/server/auth/oidc';
import { setOidcStateCookie, isValidReturnTo } from '$lib/server/auth/oidc-state';
import { isSecureRequest } from '$lib/server/auth';

export const GET: RequestHandler = async ({ url, cookies, locals, request }) => {
	if (!isOidcEnabled()) error(404);

	if (locals.user) {
		redirect(302, locals.user.role === 'caretaker' ? '/care' : '/');
	}

	const rawReturnTo = url.searchParams.get('returnTo') ?? '/';
	const returnTo = isValidReturnTo(rawReturnTo) ? rawReturnTo : '/';

	const codeVerifier = client.randomPKCECodeVerifier();
	const codeChallenge = await client.calculatePKCECodeChallenge(codeVerifier);
	const state = client.randomState();
	const nonce = client.randomNonce();

	const config = getOidcConfig()!;
	const discovered = await discoverOidcClient();

	const authUrl = client.buildAuthorizationUrl(discovered, {
		redirect_uri: config.redirectUri,
		scope: config.scopes,
		code_challenge: codeChallenge,
		code_challenge_method: 'S256',
		state,
		nonce
	});

	const secure = isSecureRequest(request);
	await setOidcStateCookie(
		cookies,
		{ state, nonce, codeVerifier, returnTo, createdAt: Date.now() },
		secure
	);

	redirect(302, authUrl.href);
};
