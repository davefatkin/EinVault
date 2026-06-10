import http from 'node:http';
import type { Fake } from './types';

export interface NtfyPublish {
	topic: string;
	title?: string;
	message?: string;
	click?: string;
	authorization: string | null;
}

export interface NtfyFake extends Fake {
	port: number;
	publishes: NtfyPublish[];
	/** Resolves when a captured publish matches; rejects after timeoutMs. */
	waitForPublish(match: (p: NtfyPublish) => boolean, timeoutMs?: number): Promise<NtfyPublish>;
}

export async function startNtfyFake(): Promise<NtfyFake> {
	const publishes: NtfyPublish[] = [];
	const waiters: Array<{ match: (p: NtfyPublish) => boolean; resolve: (p: NtfyPublish) => void }> =
		[];

	const server = http.createServer((req, res) => {
		if (req.method !== 'POST') {
			res.writeHead(405).end();
			return;
		}
		const chunks: Buffer[] = [];
		req.on('data', (c) => chunks.push(c));
		req.on('end', () => {
			try {
				const body = JSON.parse(Buffer.concat(chunks).toString()) as Omit<
					NtfyPublish,
					'authorization'
				>;
				const publish: NtfyPublish = {
					...body,
					authorization: req.headers.authorization ?? null
				};
				publishes.push(publish);
				for (let i = waiters.length - 1; i >= 0; i--) {
					if (waiters[i].match(publish)) {
						waiters[i].resolve(publish);
						waiters.splice(i, 1);
					}
				}
				res.writeHead(200, { 'content-type': 'application/json' }).end('{}');
			} catch {
				res.writeHead(400).end();
			}
		});
	});

	const port = await new Promise<number>((resolve, reject) => {
		server.listen(0, '127.0.0.1', () => {
			const addr = server.address();
			if (addr && typeof addr === 'object') resolve(addr.port);
			else reject(new Error('ntfy fake: no port'));
		});
	});

	return {
		url: `http://127.0.0.1:${port}`,
		port,
		publishes,
		waitForPublish(match, timeoutMs = 15_000) {
			const existing = publishes.find(match);
			if (existing) return Promise.resolve(existing);
			return new Promise((resolve, reject) => {
				const timer = setTimeout(
					() => reject(new Error('ntfy fake: timed out waiting for publish')),
					timeoutMs
				);
				waiters.push({
					match,
					resolve: (p) => {
						clearTimeout(timer);
						resolve(p);
					}
				});
			});
		},
		reset() {
			publishes.length = 0;
			waiters.length = 0;
		},
		stop: () => new Promise((resolve) => server.close(() => resolve()))
	};
}
