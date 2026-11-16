// Helpers for serve.js. Kept separate so unit tests can import them without
// loading the build.

/**
 * Only origin-form targets (`/path`) and `OPTIONS *` reach the app. Kit builds
 * the request URL by appending the target to the origin, so an absolute-form
 * target would produce a nonsense URL.
 * @param {string | undefined} target
 * @param {string | undefined} method
 */
export function isValidRequestTarget(target, method) {
	if (target === '*') return method === 'OPTIONS';
	return typeof target === 'string' && target.startsWith('/');
}

// Matches the cookie name as a key. Keep in sync with SESSION_COOKIE_NAME in
// src/lib/server/auth/session.ts (a unit test checks it).
export const SESSION_COOKIE_NAME = 'einvault_session';
const SESSION_COOKIE = new RegExp(`(?:^|;\\s*)${SESSION_COOKIE_NAME}=`);

/**
 * Kit 3's CSRF check rejects a mutating request with no Content-Type unless
 * its Origin matches, and scripts and devices send no Origin. A Bearer
 * request to the API gets a neutral type so it is judged as Kit 2 judged it.
 * A cross-site page cannot add a Bearer header without a CORS preflight,
 * which the app never answers, so this opens nothing to CSRF. Basic auth is
 * excluded because browsers attach it on their own. Requests that carry the
 * session cookie keep Kit's check, because a proxy may add Bearer to browser
 * traffic.
 * @param {string | undefined} target
 * @param {import('node:http').IncomingHttpHeaders} headers
 */
export function needsApiContentType(target, headers) {
	if (
		!target?.startsWith('/') ||
		headers['content-type'] ||
		SESSION_COOKIE.test(headers.cookie ?? '')
	) {
		return false;
	}
	if (!/^Bearer\s/i.test(headers.authorization ?? '')) return false;
	// Same concatenation Kit uses, so `/api/../x` is judged by where it lands.
	const url = `http://localhost${target}`;
	return URL.canParse(url) && new URL(url).pathname.startsWith('/api/');
}
