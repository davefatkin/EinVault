// Production entry point: `node serve.js` instead of `node build`.
//
// adapter-node 6 dropped the runtime ORIGIN env var, and Kit 3's CSRF check
// rejects body-less requests from clients that send no Origin header. This
// wraps the adapter's own server so existing installs keep working:
// - ORIGIN is mapped onto two request headers the client cannot spoof.
// - Body-less Bearer calls to /api/ get a neutral Content-Type.
// Drop the ORIGIN half once a runtime origin lands upstream:
// https://github.com/sveltejs/kit/issues/17328

import process from 'node:process';
import {
	applyOriginEnv,
	applyOriginHeaders,
	isValidRequestTarget,
	needsApiContentType,
	parseOrigin
} from './serve-origin.js';

/** @type {import('./serve-origin.js').ParsedOrigin | null} */
let origin = null;
try {
	origin = parseOrigin(process.env.ORIGIN);
} catch (err) {
	console.error(err instanceof Error ? err.message : String(err));
	process.exit(1);
}

if (origin) {
	for (const warning of origin.warnings) console.warn(warning);
	const overridden = applyOriginEnv(process.env, origin);
	if (overridden.length > 0) {
		console.warn(`ORIGIN is set, so ${overridden.join(', ')} will be ignored`);
	}
}

// The adapter is configured without envPrefix. If one is ever added, the env
// writes above must use the prefixed names.
// Imported dynamically so the env writes above land before the adapter reads
// them; a static import would be hoisted above them.
const entry = new URL('./build/index.js', import.meta.url).href;
const { server } = /** @type {{ server: import('node:http').Server }} */ (await import(entry));

// The adapter has already attached its handler and called listen(). No request
// can be dispatched before this runs, since the import resolved in this turn.
const listeners = /** @type {import('node:http').RequestListener[]} */ (
	server.listeners('request')
);
server.removeAllListeners('request');
server.on('request', (req, res) => {
	if (!isValidRequestTarget(req.url, req.method)) {
		res.statusCode = 400;
		res.end('Bad Request');
		return;
	}
	if (origin) applyOriginHeaders(req.headers, origin);
	if (needsApiContentType(req.url, req.headers)) {
		req.headers['content-type'] = 'application/octet-stream';
	}
	for (const listener of listeners) listener.call(server, req, res);
});
