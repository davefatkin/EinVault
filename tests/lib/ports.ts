import net from 'node:net';

/**
 * Probe-and-release has an inherent TOCTOU window: another process can grab
 * the port between close() and the child's listen(). startAppServer retries
 * an auto-picked port that comes back EADDRINUSE.
 */
export function getFreePort(): Promise<number> {
	return new Promise((resolve, reject) => {
		const srv = net.createServer();
		srv.listen(0, '127.0.0.1', () => {
			const addr = srv.address();
			if (addr && typeof addr === 'object') {
				const port = addr.port;
				srv.close(() => resolve(port));
			} else {
				srv.close(() => reject(new Error('no port')));
			}
		});
	});
}
