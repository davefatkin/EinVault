/**
 * Minimal Immich API fake for unit and e2e tests.
 *
 * App env wiring for specs that exercise Immich storage:
 *   STORAGE_BACKEND=immich
 *   IMMICH_URL=<fake.url>              (e.g. http://127.0.0.1:<port>)
 *   IMMICH_API_KEY=immich-test-key
 *   IMMICH_ALBUM_ID=<albumId>          (optional; omit to use search/metadata mode)
 */

import http from 'node:http';
import type { Fake } from './types';

export interface ImmichAsset {
	id: string;
	originalFileName: string;
	originalMimeType: string;
	fileSizeInByte: number;
	thumbhash: string | null;
	fileCreatedAt: string;
	type: 'IMAGE' | 'VIDEO';
}

export interface ImmichFake extends Fake {
	port: number;
	apiKey: string;
	/** Replace the asset library (also used for album contents). */
	setAssets(assets: ImmichAsset[]): void;
	/** Raw bytes served for thumbnail/original requests. */
	imageBytes: Buffer;
}

// 1x1 transparent PNG.
const PNG = Buffer.from(
	'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
	'base64'
);

export function makeImmichAsset(id: string, overrides?: Partial<ImmichAsset>): ImmichAsset {
	return {
		id,
		originalFileName: `${id}.png`,
		originalMimeType: 'image/png',
		fileSizeInByte: PNG.length,
		thumbhash: null,
		fileCreatedAt: '2026-01-01T00:00:00.000Z',
		type: 'IMAGE',
		...overrides
	};
}

export async function startImmichFake(apiKey = 'immich-test-key'): Promise<ImmichFake> {
	let assets: ImmichAsset[] = [];

	const server = http.createServer((req, res) => {
		if (req.headers['x-api-key'] !== apiKey) {
			res.writeHead(401, { 'content-type': 'application/json' }).end('{"message":"unauthorized"}');
			return;
		}
		const url = new URL(req.url!, 'http://localhost');
		const json = (status: number, body: unknown) =>
			res.writeHead(status, { 'content-type': 'application/json' }).end(JSON.stringify(body));

		if (req.method === 'POST' && url.pathname === '/api/search/metadata') {
			const chunks: Buffer[] = [];
			req.on('data', (c) => chunks.push(c));
			req.on('end', () => {
				const body = JSON.parse(Buffer.concat(chunks).toString() || '{}') as {
					page?: number;
					size?: number;
				};
				const page = body.page ?? 1;
				const size = body.size ?? 100;
				const items = assets.slice((page - 1) * size, page * size);
				const hasNext = page * size < assets.length;
				json(200, { assets: { items, nextPage: hasNext ? String(page + 1) : null } });
			});
			return;
		}

		const albumMatch = /^\/api\/albums\/([^/]+)$/.exec(url.pathname);
		if (req.method === 'GET' && albumMatch) {
			json(200, { id: albumMatch[1], assets });
			return;
		}

		const bytesMatch = /^\/api\/assets\/([^/]+)\/(thumbnail|original)$/.exec(url.pathname);
		if (req.method === 'GET' && bytesMatch) {
			const asset = assets.find((a) => a.id === bytesMatch[1]);
			if (!asset) {
				json(404, { message: 'not found' });
				return;
			}
			res.writeHead(200, { 'content-type': 'image/png', 'content-length': PNG.length });
			res.end(PNG);
			return;
		}

		const assetMatch = /^\/api\/assets\/([^/]+)$/.exec(url.pathname);
		if (req.method === 'GET' && assetMatch) {
			const asset = assets.find((a) => a.id === assetMatch[1]);
			if (!asset) {
				json(404, { message: 'not found' });
				return;
			}
			json(200, asset);
			return;
		}

		json(404, { message: 'unknown endpoint' });
	});

	const port = await new Promise<number>((resolve, reject) => {
		server.listen(0, '127.0.0.1', () => {
			const addr = server.address();
			if (addr && typeof addr === 'object') resolve(addr.port);
			else reject(new Error('immich fake: no port'));
		});
	});

	return {
		url: `http://127.0.0.1:${port}`,
		port,
		apiKey,
		imageBytes: PNG,
		setAssets(next) {
			assets = next;
		},
		reset() {
			assets = [];
		},
		stop: () => new Promise((resolve) => server.close(() => resolve()))
	};
}
