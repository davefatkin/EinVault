// Helpers for serve.js. This file must never import anything from build/:
// serve.js sets the adapter's env vars before the build is loaded.

/** Request headers serve.js fills from ORIGIN. Lowercase, as Node stores them. */
export const SYNTHETIC_PROTO_HEADER = 'x-einvault-origin-proto';
export const SYNTHETIC_HOST_HEADER = 'x-einvault-origin-host';

const ADAPTER_HEADER_VARS = ['PROTOCOL_HEADER', 'HOST_HEADER', 'PORT_HEADER'];

/**
 * @typedef {object} ParsedOrigin
 * @property {string} origin canonical origin, e.g. `https://einvault.example.com`
 * @property {string} proto scheme without the colon
 * @property {string} host host, plus the port when it is not the default
 * @property {string[]} warnings
 */

/**
 * Parse ORIGIN the way adapter-node 5 did: unset means no origin, anything
 * that is not an http(s) URL is fatal, and a path, query, hash or
 * credentials are dropped with a warning.
 * @param {string | undefined} raw
 * @returns {ParsedOrigin | null}
 */
export function parseOrigin(raw) {
	if (raw === undefined) return null;
	if (!URL.canParse(raw)) throw new Error('ORIGIN is set but is not a valid URL');
	const url = new URL(raw);
	if ((url.protocol !== 'http:' && url.protocol !== 'https:') || url.origin === 'null') {
		throw new Error(`ORIGIN must be an http:// or https:// URL, got a ${url.protocol} URL`);
	}
	/** @type {string[]} */
	const warnings = [];
	if (url.username || url.password || url.pathname !== '/' || url.search || url.hash) {
		warnings.push(`ORIGIN has a path, query, hash or credentials; using ${url.origin}`);
	}
	return { origin: url.origin, proto: url.protocol.slice(0, -1), host: url.host, warnings };
}

/**
 * Point adapter-node at the synthetic headers and store the canonical ORIGIN,
 * which the app reads for password-reset links. Must run before build/ is
 * imported, since the adapter reads these vars when it loads.
 * @param {NodeJS.ProcessEnv} env
 * @param {ParsedOrigin} parsed
 * @returns {string[]} operator-set header vars that ORIGIN overrides
 */
export function applyOriginEnv(env, parsed) {
	const overridden = ADAPTER_HEADER_VARS.filter((name) => env[name]);
	env.ORIGIN = parsed.origin;
	env.PROTOCOL_HEADER = SYNTHETIC_PROTO_HEADER;
	env.HOST_HEADER = SYNTHETIC_HOST_HEADER;
	// Otherwise a client-supplied port would be appended to the fixed origin.
	delete env.PORT_HEADER;
	return overridden;
}

/**
 * Overwrite the synthetic headers on every request so a client cannot
 * supply its own.
 * @param {import('node:http').IncomingHttpHeaders} headers
 * @param {ParsedOrigin} parsed
 */
export function applyOriginHeaders(headers, parsed) {
	headers[SYNTHETIC_PROTO_HEADER] = parsed.proto;
	headers[SYNTHETIC_HOST_HEADER] = parsed.host;
}

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

/**
 * Kit 3's CSRF check rejects a mutating request with no Content-Type unless
 * its Origin matches, and scripts and devices send no Origin. A Bearer
 * request to the API gets a neutral type so it is judged as Kit 2 judged it.
 * A cross-site page cannot add a Bearer header without a CORS preflight,
 * which the app never answers, so this opens nothing to CSRF. Basic auth is
 * excluded because browsers attach it on their own.
 * @param {string | undefined} target
 * @param {import('node:http').IncomingHttpHeaders} headers
 */
export function needsApiContentType(target, headers) {
	if (!target?.startsWith('/') || headers['content-type']) return false;
	if (!/^Bearer\s/i.test(headers.authorization ?? '')) return false;
	// Same concatenation Kit uses, so `/api/../x` is judged by where it lands.
	const url = `http://localhost${target}`;
	return URL.canParse(url) && new URL(url).pathname.startsWith('/api/');
}
