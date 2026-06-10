/**
 * Minimal Paperless-ngx API fake for unit and e2e tests.
 *
 * App env wiring for specs that exercise the Paperless storage backend or the
 * document picker:
 *   PAPERLESS_URL=<fake.url>                  (e.g. http://127.0.0.1:<port>)
 *   PAPERLESS_API_TOKEN=paperless-test-token
 *   PAPERLESS_TAG_ID=<tagId>                  (optional; omit to search all docs)
 */

import http from 'node:http';
import type { Fake } from './types';

export interface PaperlessDoc {
	id: number;
	title: string;
	created: string;
	document_type: number | null;
	archive_serial_number: string | null;
	mime_type: string;
	archived_file_name: string;
	tags: number[];
	/** Fake-only: bytes served by /download/. */
	content: Buffer;
}

export interface PaperlessFake extends Fake {
	port: number;
	token: string;
	setDocuments(docs: PaperlessDoc[]): void;
}

const PDF = Buffer.from('%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n');
const PNG = Buffer.from(
	'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
	'base64'
);

export function makePaperlessDoc(id: number, overrides?: Partial<PaperlessDoc>): PaperlessDoc {
	return {
		id,
		title: `Document ${id}`,
		created: '2026-01-01T00:00:00Z',
		document_type: null,
		archive_serial_number: null,
		mime_type: 'application/pdf',
		archived_file_name: `doc-${id}.pdf`,
		tags: [],
		content: PDF,
		...overrides
	};
}

export async function startPaperlessFake(token = 'paperless-test-token'): Promise<PaperlessFake> {
	let docs: PaperlessDoc[] = [];

	const server = http.createServer((req, res) => {
		if (req.headers.authorization !== `Token ${token}`) {
			res.writeHead(401, { 'content-type': 'application/json' }).end('{"detail":"unauthorized"}');
			return;
		}
		const url = new URL(req.url!, 'http://localhost');
		const json = (status: number, body: unknown) =>
			res.writeHead(status, { 'content-type': 'application/json' }).end(JSON.stringify(body));
		const summarize = ({ content: _content, ...rest }: PaperlessDoc) => rest;

		if (req.method === 'GET' && url.pathname === '/api/documents/') {
			const page = Number(url.searchParams.get('page') ?? '1');
			const size = Number(url.searchParams.get('page_size') ?? '25');
			const query = url.searchParams.get('query')?.toLowerCase();
			const tag = url.searchParams.get('tags__id__all');

			let filtered = docs;
			if (tag) filtered = filtered.filter((d) => d.tags.includes(Number(tag)));
			if (query) filtered = filtered.filter((d) => d.title.toLowerCase().includes(query));

			const results = filtered.slice((page - 1) * size, page * size).map(summarize);
			const hasNext = page * size < filtered.length;
			const nextParams = new URLSearchParams(url.searchParams);
			nextParams.set('page', String(page + 1));
			json(200, {
				count: filtered.length,
				next: hasNext ? `${url.pathname}?${nextParams}` : null,
				results
			});
			return;
		}

		const detail = /^\/api\/documents\/(\d+)\/(download\/|thumb\/)?$/.exec(url.pathname);
		if (req.method === 'GET' && detail) {
			const doc = docs.find((d) => d.id === Number(detail[1]));
			if (!doc) {
				json(404, { detail: 'Not found.' });
				return;
			}
			if (detail[2] === 'download/') {
				res.writeHead(200, { 'content-type': doc.mime_type, etag: '"fake"' });
				res.end(doc.content);
				return;
			}
			if (detail[2] === 'thumb/') {
				res.writeHead(200, { 'content-type': 'image/png' });
				res.end(PNG);
				return;
			}
			json(200, summarize(doc));
			return;
		}

		json(404, { detail: 'unknown endpoint' });
	});

	const port = await new Promise<number>((resolve, reject) => {
		server.listen(0, '127.0.0.1', () => {
			const addr = server.address();
			if (addr && typeof addr === 'object') resolve(addr.port);
			else reject(new Error('paperless fake: no port'));
		});
	});

	return {
		url: `http://127.0.0.1:${port}`,
		port,
		token,
		setDocuments(next) {
			docs = next;
		},
		reset() {
			docs = [];
		},
		stop: () => new Promise((resolve) => server.close(() => resolve()))
	};
}
