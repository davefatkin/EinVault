import { error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { t } from '$lib/i18n';
import { db, schema } from '$lib/server/db';
import { eq } from 'drizzle-orm';
import { getStorage, type GetResult } from '$lib/server/storage';

// RFC 5987 encoding for the attachment filename. The raw originalName is
// user-controlled and must never land unencoded in a header value.
function contentDisposition(
	mode: 'inline' | 'attachment',
	serverName: string,
	originalName: string | null
): string {
	if (mode === 'inline') return `inline; filename="${serverName}"`;
	const fallback = (originalName ?? serverName)
		.replace(/[^\x20-\x7e]/g, '_')
		.replace(/["\\]/g, '_');
	const encoded = encodeURIComponent(originalName ?? serverName);
	return `attachment; filename="${fallback}"; filename*=UTF-8''${encoded}`;
}

export const GET: RequestHandler = async ({ params, url, locals, request }) => {
	if (!locals.user) error(401, t(locals.locale, 'error.unauthorized'));
	// Documents are owner-private — stricter than /api/photos, which lets
	// assigned caretakers read. Do NOT copy the assignment-check logic.
	if (locals.user.role === 'caretaker') error(403, t(locals.locale, 'error.forbidden'));

	const segments = (params.path ?? '').split('/');
	if (segments.length !== 2) error(404, t(locals.locale, 'error.notFound'));
	const [urlCompanionId, filename] = segments;

	// Filename is server-generated `{documentId}.{ext}` — parse the id and
	// look the row up by primary key, then verify the URL's claims against
	// the row. Storage is only ever touched via row.storageKey.
	const documentId = filename.split('.')[0] ?? '';
	const doc = await db.query.documents.findFirst({
		where: eq(schema.documents.id, documentId)
	});
	if (!doc || doc.filename !== filename || doc.companionId !== urlCompanionId) {
		error(404, t(locals.locale, 'error.notFound'));
	}

	const ifNoneMatch = request.headers.get('if-none-match');
	let res: GetResult | null;
	try {
		res = await getStorage(doc.provider).get(doc.storageKey, { ifNoneMatch });
	} catch (err) {
		if (err instanceof Error && err.message.includes('escapes upload root')) {
			error(403, t(locals.locale, 'error.forbidden'));
		}
		console.error(`[documents] storage error provider=${doc.provider} key=${doc.storageKey}:`, err);
		error(502, t(locals.locale, 'error.fileNotFound'));
	}
	if (!res) error(404, t(locals.locale, 'error.fileNotFound'));

	if (res.kind === 'notModified') {
		return new Response(null, { status: 304, headers: { ETag: res.etag } });
	}

	if (res.kind === 'redirect') {
		// S3 presigned URL. S3 serves the Content-Type set at PUT; our CSP
		// does not travel with the redirect — accepted tradeoff (photos do
		// the same).
		return new Response(null, {
			status: 302,
			headers: {
				Location: res.url,
				'Cache-Control': `private, max-age=${res.cacheSeconds}`,
				'Referrer-Policy': 'no-referrer'
			}
		});
	}

	const wantDownload = url.searchParams.has('download');
	const cacheControl =
		doc.provider === 'paperless' ? 'private, max-age=300' : 'private, max-age=31536000, immutable';

	const headers: Record<string, string> = {
		// Always from the validated DB column — never from the filename or
		// upstream response headers.
		'Content-Type': doc.mimeType,
		'Cache-Control': cacheControl,
		ETag: res.stat.etag,
		'X-Content-Type-Options': 'nosniff',
		// Opaque-origin every byte response: even if a future bug serves
		// attacker bytes as HTML, scripts/forms/plugins are inert. (App-page
		// CSP does not apply to non-HTML +server responses.)
		'Content-Security-Policy': 'sandbox',
		'Content-Disposition': contentDisposition(
			wantDownload ? 'attachment' : 'inline',
			doc.filename,
			doc.originalName
		)
	};

	// Paperless streams may be chunked with unknown length; emitting
	// Content-Length: 0 would truncate the body, so only set it when known.
	if (res.stat.size > 0) headers['Content-Length'] = String(res.stat.size);
	return new Response(res.stream, { headers });
};
