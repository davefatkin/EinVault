/**
 * Minimal path-style S3 fake for unit and e2e tests.
 *
 * App env wiring for e2e specs that exercise S3 storage:
 *   STORAGE_BACKEND=s3
 *   S3_ENDPOINT=<fake.url>           (e.g. http://127.0.0.1:<port>)
 *   S3_BUCKET=einvault-test
 *   S3_REGION=auto
 *   S3_ACCESS_KEY_ID=test
 *   S3_SECRET_ACCESS_KEY=test
 *   S3_FORCE_PATH_STYLE=true
 */

import http from 'node:http';
import type { Fake } from './types';

export interface S3Object {
	body: Buffer;
	contentType: string;
}

export interface S3Fake extends Fake {
	port: number;
	bucket: string;
	/** key → object. Inspect or pre-seed directly. */
	objects: Map<string, S3Object>;
}

const BUCKET = 'einvault-test';

export async function startS3Fake(): Promise<S3Fake> {
	const objects = new Map<string, S3Object>();

	const server = http.createServer((req, res) => {
		const url = new URL(req.url!, 'http://localhost');
		const prefix = `/${BUCKET}/`;
		if (!url.pathname.startsWith(prefix)) {
			res.writeHead(404).end('<Error><Code>NoSuchBucket</Code></Error>');
			return;
		}
		const key = decodeURIComponent(url.pathname.slice(prefix.length));

		if (req.method === 'PUT') {
			const chunks: Buffer[] = [];
			req.on('data', (c) => chunks.push(c));
			req.on('end', () => {
				objects.set(key, {
					body: Buffer.concat(chunks),
					contentType: req.headers['content-type'] ?? 'application/octet-stream'
				});
				res.writeHead(200, { etag: '"fake"' }).end();
			});
			return;
		}

		if (req.method === 'DELETE') {
			objects.delete(key); // S3 DELETE is idempotent: 204 even if absent
			res.writeHead(204).end();
			return;
		}

		if (req.method === 'GET' || req.method === 'HEAD') {
			const obj = objects.get(key);
			if (!obj) {
				res.writeHead(404).end('<Error><Code>NoSuchKey</Code></Error>');
				return;
			}
			const range = req.headers.range;
			const m = range ? /^bytes=(\d+)-(\d*)$/.exec(range) : null;
			if (m) {
				const start = Number(m[1]);
				const end = m[2] ? Math.min(Number(m[2]), obj.body.length - 1) : obj.body.length - 1;
				if (start > end || start >= obj.body.length) {
					res.writeHead(416, { 'content-range': `bytes */${obj.body.length}` }).end();
					return;
				}
				res.writeHead(206, {
					'content-type': obj.contentType,
					'content-length': end - start + 1,
					'content-range': `bytes ${start}-${end}/${obj.body.length}`,
					'accept-ranges': 'bytes'
				});
				res.end(req.method === 'HEAD' ? undefined : obj.body.subarray(start, end + 1));
				return;
			}
			res.writeHead(200, {
				'content-type': obj.contentType,
				'content-length': obj.body.length,
				'accept-ranges': 'bytes'
			});
			res.end(req.method === 'HEAD' ? undefined : obj.body);
			return;
		}

		res.writeHead(405).end();
	});

	const port = await new Promise<number>((resolve, reject) => {
		server.listen(0, '127.0.0.1', () => {
			const addr = server.address();
			if (addr && typeof addr === 'object') resolve(addr.port);
			else reject(new Error('s3 fake: no port'));
		});
	});

	return {
		url: `http://127.0.0.1:${port}`,
		port,
		bucket: BUCKET,
		objects,
		reset() {
			objects.clear();
		},
		stop: () => new Promise((resolve) => server.close(() => resolve()))
	};
}
