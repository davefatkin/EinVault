import { error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { t } from '$lib/i18n';
import { db, schema } from '$lib/server/db';
import { eq, and } from 'drizzle-orm';
import { getStorage, type GetResult } from '$lib/server/storage';

// URL shape: /api/photos/journal/{companionId}/{date}/{filename}
const JOURNAL_PREFIX = 'journal';

export const GET: RequestHandler = async ({ params, url, locals, request }) => {
	if (!locals.user) error(401, t(locals.locale, 'error.unauthorized'));

	const requestedPath = params.path ?? '';
	const segments = requestedPath.split('/');
	if (segments.length !== 4 || segments[0] !== JOURNAL_PREFIX) {
		error(404, t(locals.locale, 'error.notFound'));
	}
	const [, urlCompanionId, urlDate, filename] = segments;

	// Look up by filename, then verify the row belongs to the companion + date
	// asserted in the URL. Without this scoping, two rows sharing a filename
	// (unlikely for local/S3, possible across providers) could let one URL
	// surface another row's content.
	const photo = await db.query.journalPhotos.findFirst({
		where: eq(schema.journalPhotos.filename, filename),
		with: { entry: { columns: { companionId: true, date: true } } }
	});
	if (!photo || !photo.entry) error(404, t(locals.locale, 'error.notFound'));
	if (photo.entry.companionId !== urlCompanionId || photo.entry.date !== urlDate) {
		error(404, t(locals.locale, 'error.notFound'));
	}

	// For caretakers, verify they are assigned to the companion that owns this photo
	if (locals.user.role === 'caretaker') {
		const assignment = await db.query.companionCaretakers.findFirst({
			where: and(
				eq(schema.companionCaretakers.companionId, photo.entry.companionId),
				eq(schema.companionCaretakers.userId, locals.user.id)
			)
		});
		if (!assignment) error(403, t(locals.locale, 'error.forbidden'));
	}

	// `?poster` serves the transcoded video's generated poster JPEG instead of the
	// media itself. The poster key comes from the row (resolved after the same
	// companion/date/caretaker scoping above), never from the client, so it can't
	// be used to read another companion's object. The kept original (originalKey)
	// is deliberately never served by any route.
	const wantPoster = url.searchParams.has('poster');
	let key: string;
	let contentType: string;
	if (wantPoster) {
		if (!photo.posterKey) error(404, t(locals.locale, 'error.notFound'));
		key = photo.posterKey;
		contentType = 'image/jpeg';
	} else {
		// For local rows the URL path IS the storage key. For S3 / Immich rows we
		// use the row's storage_key column instead.
		key = photo.storageKey ?? requestedPath;
		contentType = photo.mimeType;
	}
	const ifNoneMatch = request.headers.get('if-none-match');
	const range = request.headers.get('range');

	let res: GetResult | null;
	try {
		res = await getStorage(photo.provider).get(key, { ifNoneMatch, range });
	} catch (err) {
		if (err instanceof Error && err.message.includes('escapes upload root')) {
			error(403, t(locals.locale, 'error.forbidden'));
		}
		console.error(`[photos] storage error provider=${photo.provider} key=${key}:`, err);
		error(502, t(locals.locale, 'error.fileNotFound'));
	}
	if (!res) error(404, t(locals.locale, 'error.fileNotFound'));

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
		photo.provider === 'immich' ? 'private, max-age=300' : 'private, max-age=31536000, immutable';

	const headers: Record<string, string> = {
		'Content-Type': contentType,
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
};
