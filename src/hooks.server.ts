import { redirect, json } from '@sveltejs/kit';
import type { Handle } from '@sveltejs/kit';
import { sequence } from '@sveltejs/kit/hooks';
import { validateAuth } from '$server/auth';
import { env } from '$env/dynamic/private';
import { resolveLocale, parseAcceptLanguage } from '$lib/i18n';
import { logOidcBootStatus } from '$lib/server/auth/oidc';
import {
	S3_CONFIG,
	DEMO_MODE,
	logImmichBootStatus,
	logPaperlessBootStatus,
	logStorageBootStatus,
	logDeprecatedEnvWarnings,
	logVideoTranscodeBootStatus,
	logSmtpBootStatus,
	logNtfyBootStatus,
	logTwoFactorBootStatus,
	logDemoBootStatus
} from '$lib/server/env';
import { isDemoBlockedRequest } from '$lib/server/demo';
import { recoverAndStart } from '$lib/server/video/worker';
import { startNotifyScheduler } from '$lib/server/notify/scheduler';
import { getAppSettings } from '$lib/server/app-settings';
import { requiresTwoFactor } from '$lib/server/auth/two-factor';

logOidcBootStatus();
logStorageBootStatus();
logImmichBootStatus();
logPaperlessBootStatus();
logDeprecatedEnvWarnings();
logVideoTranscodeBootStatus();
logSmtpBootStatus();
logNtfyBootStatus();
logDemoBootStatus();
logTwoFactorBootStatus();

// Resume any transcode jobs interrupted by a restart and drain the queue. No-op
// unless VIDEO_TRANSCODE is enabled and ffmpeg is present. Fire and forget.
recoverAndStart();
startNotifyScheduler();

if (DEMO_MODE) {
	import('./lib/server/db/demo-seed')
		.then(({ ensureDemoUsers, refreshDemoContent, startDemoRefreshScheduler }) => {
			return ensureDemoUsers().then(() => {
				refreshDemoContent();
				startDemoRefreshScheduler();
			});
		})
		.catch((err) => console.error('[demo] boot setup failed:', err));
}

// When S3 storage is configured, /api/photos and /api/avatars 302 to the S3
// host. CSP is enforced on the final navigation target after redirects, so the
// S3 origin has to appear in img-src (photos/avatars) AND media-src (videos) or
// the browser blocks the load. Computed once at boot from runtime env so
// swapping S3_ENDPOINT only needs a container restart, not a rebuild.
const S3_ASSET_ORIGIN: string | null = (() => {
	if (!S3_CONFIG) return null;
	try {
		return new URL(S3_CONFIG.endpoint).origin;
	} catch {
		return null;
	}
})();

// Default sources used when a directive is absent and we need to add it.
const DIRECTIVE_DEFAULTS: Record<string, string> = {
	'img-src': "'self' data: blob:",
	'media-src': "'self' blob:"
};

function injectAssetOrigin(csp: string, origin: string): string {
	let result = csp;
	for (const directive of Object.keys(DIRECTIVE_DEFAULTS)) {
		const present = new RegExp(`(^|;)\\s*${directive}\\b`, 'i').test(result);
		if (present) {
			// Append the origin inside every matching directive. Callback form so
			// arbitrary characters in `origin` are not interpreted as backrefs.
			result = result.replace(
				new RegExp(`(${directive}\\b[^;]*)`, 'gi'),
				(_m, captured) => `${captured} ${origin}`
			);
		} else {
			result = `${result.replace(/;?\s*$/, '')}; ${directive} ${DIRECTIVE_DEFAULTS[directive]} ${origin}`;
		}
	}
	return result;
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
			"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; media-src 'self' blob:; font-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'"
		);
	}

	if (S3_ASSET_ORIGIN) {
		const csp = response.headers.get('content-security-policy');
		if (csp) {
			response.headers.set('content-security-policy', injectAssetOrigin(csp, S3_ASSET_ORIGIN));
		}
	}

	if (env.NODE_ENV === 'production') {
		response.headers.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
	}

	return response;
};

// asset routes skip cookie refresh so responses stay cacheable
const ASSET_PATHS = [
	'/api/avatars/',
	'/api/photos/',
	'/api/documents/',
	'/api/calendar/',
	'/api/users/'
];

const authContext: Handle = async ({ event, resolve }) => {
	const isAsset = ASSET_PATHS.some((p) => event.url.pathname.startsWith(p));
	const { session, user } = await validateAuth(event, { refreshCookie: !isAsset });
	event.locals.session = session;
	event.locals.user = user;
	return resolve(event);
};

const twoFactorGate: Handle = async ({ event, resolve }) => {
	const user = event.locals.user;
	if (user) {
		const path = event.url.pathname;
		const allowed =
			path === '/2fa-setup' || path.startsWith('/2fa-setup/') || path.startsWith('/auth/');
		if (!allowed) {
			const { require2fa } = await getAppSettings();
			if (
				requiresTwoFactor(
					{ role: user.role, isOidc: user.isOidc, totpEnabled: user.totpEnabled },
					require2fa
				)
			) {
				if (path.startsWith('/api/')) {
					return new Response('Two-factor authentication required', { status: 403 });
				}
				redirect(303, '/2fa-setup');
			}
		}
	}
	return resolve(event);
};

const demoReadOnly: Handle = async ({ event, resolve }) => {
	if (DEMO_MODE && isDemoBlockedRequest(event.request.method, event.url.pathname)) {
		if (event.url.pathname.startsWith('/api')) {
			return json({ error: 'This is a read-only demo.', demo: true }, { status: 403 });
		}
		event.cookies.set('einvault_demo_notice', '1', {
			path: '/',
			httpOnly: false,
			sameSite: 'strict',
			secure: event.url.protocol === 'https:',
			maxAge: 30
		});
		const referer = event.request.headers.get('referer');
		const back =
			referer && URL.canParse(referer) ? new URL(referer).pathname + new URL(referer).search : '/';
		redirect(303, back);
	}
	// Read path: prevent any CDN/proxy from caching authenticated HTML, so one
	// visitor's session-rendered page can never be served to another. This
	// is enforced server-side and does not depend on Cloudflare config.
	const response = await resolve(event);
	if (DEMO_MODE) {
		const ct = response.headers.get('content-type') ?? '';
		if (ct.includes('text/html')) {
			response.headers.set('Cache-Control', 'private, no-store');
			response.headers.append('Vary', 'Cookie');
		}
	}
	return response;
};

const localeDetect: Handle = async ({ event, resolve }) => {
	// Priority: user preference > cookie > Accept-Language > default
	const cookieRaw = event.cookies.get('einvault_locale');
	const locale =
		event.locals.user?.locale ??
		(cookieRaw ? resolveLocale(cookieRaw) : null) ??
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

export const handle = sequence(
	securityHeaders,
	authContext,
	twoFactorGate,
	demoReadOnly,
	localeDetect
);
