import type { PaperlessConfig } from '$lib/server/env';
import type { GetResult, StorageBackend } from './types';

const KEY_PREFIX = 'paperless:';
// Paperless document ids are integer PKs. Pin the format so a stored row
// referencing '1/../../users' can never sneak through parseKey into a URL.
export const DOC_ID_RE = /^\d{1,10}$/;

// Default timeout for any single paperless HTTP call. A hung paperless must
// not pin request workers, especially on the streaming download path.
const DEFAULT_TIMEOUT_MS = 8_000;

export function paperlessKey(docId: string | number): string {
	return `${KEY_PREFIX}${docId}`;
}

function parseKey(key: string): string {
	if (!key.startsWith(KEY_PREFIX)) {
		throw new Error(`Paperless storage key must start with '${KEY_PREFIX}'`);
	}
	const id = key.slice(KEY_PREFIX.length);
	if (!DOC_ID_RE.test(id)) {
		throw new Error('Invalid paperless document id in key');
	}
	return id;
}

function timeoutSignal(ms = DEFAULT_TIMEOUT_MS): AbortSignal {
	return AbortSignal.timeout(ms);
}

// Log full upstream context server-side; return a short generic message so
// callers (and any error.message that bubbles into a response) cannot leak
// the API token or internal paths.
async function logAndSanitize(label: string, res: Response, hint: string): Promise<Error> {
	const body = await res.text().catch(() => '');
	console.error(`[paperless] ${label} status=${res.status} body=${body.slice(0, 500)}`);
	return new Error(`${hint} (${res.status})`);
}

export function createPaperlessBackend(config: PaperlessConfig): StorageBackend {
	return {
		provider: 'paperless',

		async put() {
			throw new Error(
				'Paperless backend is read-only: use the from-paperless endpoint to reference an existing document.'
			);
		},

		async get(key: string): Promise<GetResult | null> {
			const docId = parseKey(key);
			// Serve the archived version (PDF/A with OCR layer) — paperless's
			// /download/ default. Image originals arrive as PDFs too, so every
			// paperless row previews uniformly via pdf.js.
			const res = await fetch(`${config.url}/api/documents/${docId}/download/`, {
				headers: { Authorization: `Token ${config.token}` },
				// Never follow redirects: a redirecting reverse proxy in front of
				// paperless must not receive (or bounce) the Authorization header.
				redirect: 'error',
				signal: timeoutSignal()
			});
			if (res.status === 404) return null;
			if (!res.ok || !res.body) {
				throw await logAndSanitize(`get doc=${docId}`, res, 'Paperless document fetch failed');
			}
			// Omit size when upstream is chunked (no content-length): emitting 0
			// would make the serving route send Content-Length: 0 and truncate
			// the body. size=0 is treated as "unknown" by the documents route.
			const length = Number(res.headers.get('content-length') ?? 0);
			const etag = res.headers.get('etag') ?? `"paperless-${docId}"`;
			const lastModified = res.headers.get('last-modified');
			return {
				kind: 'stream',
				stream: res.body,
				stat: {
					size: Number.isFinite(length) && length > 0 ? length : 0,
					etag,
					mtime: lastModified ? new Date(lastModified) : new Date(0)
				}
			};
		},

		async delete() {
			// Intentional no-op. EinVault stores a reference to a paperless
			// document; removing the reference must not delete the user's
			// document from their paperless archive.
		}
	};
}

export interface PaperlessDocSummary {
	id: number;
	title: string;
	created: string | null;
	documentType: number | null;
	archiveSerialNumber: string | null;
	// Mime of the ORIGINAL file. The archived version (what we serve) is
	// always PDF when present.
	originalMimeType: string;
	hasArchiveVersion: boolean;
	tags: number[];
}

export interface PaperlessClient {
	searchDocuments(opts: { query: string; page: number; pageSize: number }): Promise<{
		items: PaperlessDocSummary[];
		hasNextPage: boolean;
	}>;
	getDocument(docId: string): Promise<PaperlessDocSummary | null>;
	fetchThumbnail(docId: string): Promise<Response>;
}

interface PaperlessDocResponse {
	id: number;
	title?: string;
	created?: string;
	document_type?: number | null;
	archive_serial_number?: string | null;
	mime_type?: string;
	archived_file_name?: string | null;
	tags?: number[];
}

interface PaperlessListResponse {
	count?: number;
	next?: string | null;
	results?: PaperlessDocResponse[];
}

// Strip a document down to picker-safe fields. NEVER include `content` or
// `__search_hit__` from the upstream response: those carry the OCR'd full
// text of the document — a corpus-wide data leak if proxied to members.
function summarize(d: PaperlessDocResponse): PaperlessDocSummary {
	return {
		id: d.id,
		title: d.title ?? '',
		created: d.created ?? null,
		documentType: d.document_type ?? null,
		archiveSerialNumber: d.archive_serial_number ?? null,
		originalMimeType: d.mime_type ?? 'application/octet-stream',
		hasArchiveVersion: !!d.archived_file_name,
		tags: d.tags ?? []
	};
}

export function createPaperlessClient(config: PaperlessConfig): PaperlessClient {
	function headers(): Record<string, string> {
		return { Authorization: `Token ${config.token}`, Accept: 'application/json' };
	}

	return {
		async searchDocuments({ query, page, pageSize }) {
			// URLSearchParams so a crafted query string cannot inject parameters
			// (e.g. '&fields=content&page_size=100000') into the upstream URL.
			const params = new URLSearchParams({
				page: String(page),
				page_size: String(pageSize),
				ordering: '-created'
			});
			if (query) params.set('query', query);
			if (config.tagId !== null) params.set('tags__id__all', String(config.tagId));
			const res = await fetch(`${config.url}/api/documents/?${params}`, {
				headers: headers(),
				redirect: 'error',
				signal: timeoutSignal()
			});
			if (!res.ok) {
				throw await logAndSanitize('search', res, 'Paperless search failed');
			}
			const body = (await res.json()) as PaperlessListResponse;
			const items = (body.results ?? []).map(summarize);
			return { items, hasNextPage: !!body.next };
		},

		async getDocument(docId: string) {
			if (!DOC_ID_RE.test(docId)) return null;
			const res = await fetch(`${config.url}/api/documents/${docId}/`, {
				headers: headers(),
				redirect: 'error',
				signal: timeoutSignal()
			});
			if (res.status === 404) return null;
			if (!res.ok) {
				throw await logAndSanitize(`getDocument=${docId}`, res, 'Paperless document fetch failed');
			}
			const body = (await res.json()) as PaperlessDocResponse;
			return summarize(body);
		},

		async fetchThumbnail(docId: string) {
			if (!DOC_ID_RE.test(docId)) return new Response(null, { status: 404 });
			return fetch(`${config.url}/api/documents/${docId}/thumb/`, {
				headers: { Authorization: `Token ${config.token}`, Accept: 'image/*' },
				redirect: 'error',
				signal: timeoutSignal()
			});
		}
	};
}
