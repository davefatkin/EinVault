import { error } from '@sveltejs/kit';
import { t, type Locale } from '$lib/i18n';
import { getStorage, type GetResult } from '$lib/server/storage';
import type { ResolvedMedia } from './media-access';

// Shared response half of /api/photos/[...path]: conditional GET, byte ranges,
// presigned redirects and cache headers. Access decisions happen before this,
// in the per-prefix resolvers (media-access.ts).
export async function serveStoredMedia(
	resolved: ResolvedMedia,
	request: Request,
	locale: Locale
): Promise<Response> {
	const { provider, key, mimeType } = resolved;
	const ifNoneMatch = request.headers.get('if-none-match');
	const range = request.headers.get('range');

	let res: GetResult | null;
	try {
		res = await getStorage(provider).get(key, { ifNoneMatch, range });
	} catch (err) {
		if (err instanceof Error && err.message.includes('escapes upload root')) {
			error(403, t(locale, 'error.forbidden'));
		}
		console.error(`[photos] storage error provider=${provider} key=${key}:`, err);
		error(502, t(locale, 'error.fileNotFound'));
	}
	if (!res) error(404, t(locale, 'error.fileNotFound'));

	if (res.kind === 'notModified') {
		return new Response(null, { status: 304, headers: { ETag: res.etag } });
	}

	if (res.kind === 'redirect') {
		return new Response(null, {
			status: 302,
			headers: {
				Location: res.url,
				'Cache-Control': `private, max-age=${res.cacheSeconds}`,
				'Referrer-Policy': 'no-referrer'
			}
		});
	}

	// Local + S3 (when streamed) produce stable bytes per key; Immich serves a
	// derivative that the server can regenerate, so its content is not safe to
	// mark immutable.
	const cacheControl =
		provider === 'immich' ? 'private, max-age=300' : 'private, max-age=31536000, immutable';

	const headers: Record<string, string> = {
		'Content-Type': mimeType,
		'Cache-Control': cacheControl,
		ETag: res.stat.etag,
		'X-Content-Type-Options': 'nosniff',
		// Advertise range support so browsers will seek (needed for <video>).
		'Accept-Ranges': 'bytes'
	};

	// Partial content: the backend satisfied a byte-range request.
	if (res.range) {
		headers['Content-Range'] = `bytes ${res.range.start}-${res.range.end}/${res.range.total}`;
		headers['Content-Length'] = String(res.range.end - res.range.start + 1);
		return new Response(res.stream, { status: 206, headers });
	}

	headers['Content-Length'] = String(res.stat.size);
	return new Response(res.stream, { headers });
}
