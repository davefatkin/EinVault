// Production entry point: `node serve.js`, not `node build`.
//
// adapter-node reads ORIGIN itself. This wrapper exists because Kit 3's CSRF
// check has no exemption for body-less Bearer API calls from clients that send
// no Origin header, and to reject request targets that are not origin-form.
// - Body-less Bearer calls to /api/ get a neutral Content-Type.
// - Non-origin-form request targets get a 400.
// The adapter is configured without envPrefix. If one is ever added, the
// adapter would read a prefixed ORIGIN while app code reads env.ORIGIN.

import process from 'node:process';
import { isValidRequestTarget, needsApiContentType } from './serve-helpers.js';

// Imported dynamically: a static import of a file that only exists after a
// build trips TS2307 under checkJs.
const entry = new URL('./build/index.js', import.meta.url).href;
/** @type {{ server: import('node:http').Server }} */
let adapter;
try {
	adapter = await import(entry);
} catch (err) {
	// Import runs server.init (hooks, DB open, migrations), so any boot failure
	// lands here. Config validation errors get one clean line; everything else
	// keeps its stack and cause chain.
	if (
		err instanceof Error &&
		/^Invalid (ORIGIN|value for environment variable)/.test(err.message)
	) {
		console.error(err.message);
	} else {
		console.error(err);
	}
	process.exit(1);
}
const { server } = adapter;

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
	if (needsApiContentType(req.url, req.headers)) {
		req.headers['content-type'] = 'application/octet-stream';
	}
	for (const listener of listeners) listener.call(server, req, res);
});
