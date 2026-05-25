import type { Handle } from '@sveltejs/kit';
import { sequence } from '@sveltejs/kit/hooks';
import { validateAuth } from '$server/auth';
import { env } from '$env/dynamic/private';
import { resolveLocale, parseAcceptLanguage } from '$lib/i18n';
import { logOidcBootStatus } from '$lib/server/auth/oidc';
import { S3_CONFIG } from '$lib/server/env';

logOidcBootStatus();

// When S3 storage is configured, /api/photos and /api/avatars 302 to the S3
// host. CSP is enforced on the final navigation target after redirects, so
// the S3 origin has to appear in img-src or the browser blocks the load.
// Computed once at boot from runtime env so swapping S3_ENDPOINT only needs a
// container restart, not a rebuild.
const S3_IMG_ORIGIN: string | null = (() => {
	if (!S3_CONFIG) return null;
	try {
		return new URL(S3_CONFIG.endpoint).origin;
	} catch {
		return null;
	}
})();

function injectImgSrcOrigin(csp: string, origin: string): string {
	// Append the origin inside the existing img-src directive.
	if (/(^|;)\s*img-src\b/i.test(csp)) {
		return csp.replace(/(img-src\b[^;]*)/i, `$1 ${origin}`);
	}
	// No img-src directive present; add one.
	return `${csp.replace(/;?\s*$/, '')}; img-src 'self' data: blob: ${origin}`;
}

const securityHeaders: Handle = async ({ event, resolve }) => {
	const response = await resolve(event);

	response.headers.set('X-Frame-Options', 'DENY');
	response.headers.set('X-Content-Type-Options', 'nosniff');
	response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
	response.headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');

	// CSP is normally emitted by SvelteKit (see svelte.config.js `kit.csp`) so
	// the per-render nonce flows through `%sveltekit.nonce%`. If a `+server.ts`
	// returns HTML without going through SvelteKit's renderer, fall back to a
	// strict no-inline baseline so it doesn't ship without any CSP at all.
	const contentType = response.headers.get('content-type') ?? '';
	if (contentType.startsWith('text/html') && !response.headers.has('content-security-policy')) {
		response.headers.set(
			'Content-Security-Policy',
			"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'"
		);
	}

	if (S3_IMG_ORIGIN) {
		const csp = response.headers.get('content-security-policy');
		if (csp) {
			response.headers.set('content-security-policy', injectImgSrcOrigin(csp, S3_IMG_ORIGIN));
		}
	}

	if (env.NODE_ENV === 'production') {
		response.headers.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
	}

	return response;
};

// asset routes skip cookie refresh so responses stay cacheable
const ASSET_PATHS = ['/api/avatars/', '/api/photos/'];

const authContext: Handle = async ({ event, resolve }) => {
	const isAsset = ASSET_PATHS.some((p) => event.url.pathname.startsWith(p));
	const { session, user } = await validateAuth(event, { refreshCookie: !isAsset });
	event.locals.session = session;
	event.locals.user = user;
	return resolve(event);
};

const localeDetect: Handle = async ({ event, resolve }) => {
	// Priority: user preference > cookie > Accept-Language > default
	const locale =
		event.locals.user?.locale ??
		resolveLocale(event.cookies.get('einvault_locale')) ??
		parseAcceptLanguage(event.request.headers.get('accept-language'));

	event.locals.locale = locale;

	// Keep cookie in sync (skip for asset routes)
	const isAsset = ASSET_PATHS.some((p) => event.url.pathname.startsWith(p));
	if (!isAsset && event.cookies.get('einvault_locale') !== locale) {
		event.cookies.set('einvault_locale', locale, {
			path: '/',
			httpOnly: false,
			secure: event.request.headers.get('x-forwarded-proto') === 'https',
			sameSite: 'strict',
			maxAge: 60 * 60 * 24 * 365
		});
	}

	return resolve(event, {
		transformPageChunk: ({ html }) => html.replace('lang="en"', `lang="${locale}"`)
	});
};

export const handle = sequence(securityHeaders, authContext, localeDetect);
