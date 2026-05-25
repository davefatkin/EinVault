import { error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { t } from '$lib/i18n';
import { db, schema } from '$lib/server/db';
import { eq, and } from 'drizzle-orm';
import { getStorage } from '$lib/server/storage';

export const GET: RequestHandler = async ({ params, locals, request }) => {
	if (!locals.user) error(401, t(locals.locale, 'error.unauthorized'));

	const requestedPath = params.path ?? '';

	// Verify the photo record exists in DB (don't serve arbitrary files)
	const filename = requestedPath.split('/').pop() ?? '';
	const photo = await db.query.journalPhotos.findFirst({
		where: eq(schema.journalPhotos.filename, filename)
	});
	if (!photo) error(404, t(locals.locale, 'error.notFound'));

	// For caretakers, verify they are assigned to the companion that owns this photo
	if (locals.user.role === 'caretaker') {
		const entry = await db.query.journalEntries.findFirst({
			where: eq(schema.journalEntries.id, photo.entryId),
			columns: { companionId: true }
		});
		if (!entry) error(404, t(locals.locale, 'error.notFound'));
		const assignment = await db.query.companionCaretakers.findFirst({
			where: and(
				eq(schema.companionCaretakers.companionId, entry.companionId),
				eq(schema.companionCaretakers.userId, locals.user.id)
			)
		});
		if (!assignment) error(403, t(locals.locale, 'error.forbidden'));
	}

	// For local rows the URL path IS the storage key. For S3 rows we ignore
	// the URL prefix and use the row's storage_key column instead.
	const key = photo.storageKey ?? requestedPath;
	const ifNoneMatch = request.headers.get('if-none-match');

	let res: Awaited<ReturnType<ReturnType<typeof getStorage>['get']>>;
	try {
		res = await getStorage(photo.provider).get(key, { ifNoneMatch });
	} catch {
		error(403, t(locals.locale, 'error.forbidden'));
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

	return new Response(res.stream, {
		headers: {
			'Content-Type': photo.mimeType,
			'Content-Length': String(res.stat.size),
			'Cache-Control': 'private, max-age=31536000, immutable',
			ETag: res.stat.etag,
			'X-Content-Type-Options': 'nosniff'
		}
	});
};
