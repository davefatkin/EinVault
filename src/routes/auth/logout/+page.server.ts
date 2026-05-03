import { redirect } from '@sveltejs/kit';
import type { Actions } from './$types';
import {
	invalidateSession,
	SESSION_COOKIE_NAME,
	makeBlankCookieOptions
} from '$lib/server/auth/session';
import { isSecureRequest } from '$lib/server/auth';
import { isOidcEnabled, discoverOidcClient, getOidcConfig } from '$lib/server/auth/oidc';
import { db, schema } from '$lib/server/db';
import { eq } from 'drizzle-orm';
import { env } from '$env/dynamic/private';

export const actions: Actions = {
	default: async ({ locals, cookies, request }) => {
		const secure = isSecureRequest(request);

		let oidcIdTokenHint: string | null = null;

		if (locals.session) {
			const sessionRow = await db.query.sessions.findFirst({
				where: eq(schema.sessions.id, locals.session.id)
			});
			oidcIdTokenHint = sessionRow?.oidcIdTokenHint ?? null;
			await invalidateSession(locals.session.id);
		}

		cookies.set(SESSION_COOKIE_NAME, '', makeBlankCookieOptions(secure));

		const postLogoutUri = env.OIDC_POST_LOGOUT_REDIRECT_URI;
		let logoutHref: string | null = null;
		if (oidcIdTokenHint && postLogoutUri && isOidcEnabled()) {
			try {
				const discovered = await discoverOidcClient();
				const endSessionEndpoint = discovered.serverMetadata().end_session_endpoint;
				if (endSessionEndpoint) {
					const config = getOidcConfig()!;
					const logoutUrl = new URL(endSessionEndpoint);
					logoutUrl.searchParams.set('id_token_hint', oidcIdTokenHint);
					logoutUrl.searchParams.set('post_logout_redirect_uri', postLogoutUri);
					logoutUrl.searchParams.set('client_id', config.clientId);
					logoutHref = logoutUrl.href;
				}
			} catch {
				// Discovery failure — fall through to local logout.
			}
		}

		redirect(302, logoutHref ?? '/auth/login');
	}
};
