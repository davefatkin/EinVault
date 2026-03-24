import type { Handle } from '@sveltejs/kit';
import { sequence } from '@sveltejs/kit/hooks';
import { validateAuth } from '$server/auth';
import { env } from '$env/dynamic/private';

const securityHeaders: Handle = async ({ event, resolve }) => {
	const response = await resolve(event);

	response.headers.set('X-Frame-Options', 'DENY');
	response.headers.set('X-Content-Type-Options', 'nosniff');
	response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
	response.headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
	response.headers.set(
		'Content-Security-Policy',
		[
			"default-src 'self'",
			"script-src 'self' 'unsafe-inline'",
			"style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
			"img-src 'self' data: blob:",
			"font-src 'self' https://fonts.gstatic.com",
			"connect-src 'self'",
			"frame-ancestors 'none'"
		].join('; ')
	);

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

export const handle = sequence(securityHeaders, authContext);
