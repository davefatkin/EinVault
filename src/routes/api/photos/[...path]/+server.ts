import { error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { t } from '$lib/i18n';
import { db, schema } from '$lib/server/db';
import { eq, and } from 'drizzle-orm';
import { getStorage } from '$lib/server/storage';

export const GET: RequestHandler = async ({ params, locals, request }) => {
	if (!locals.user) error(401, t(locals.locale, 'error.unauthorized'));

	const key = params.path ?? '';

	// Verify the photo record exists in DB (don't serve arbitrary files)
	const filename = key.split('/').pop() ?? '';
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

	const storage = getStorage();

	let stat: Awaited<ReturnType<typeof storage.stat>>;
	try {
		stat = await storage.stat(key);
	} catch {
		error(403, t(locals.locale, 'error.forbidden'));
	}
	if (!stat) error(404, t(locals.locale, 'error.fileNotFound'));

	if (request.headers.get('if-none-match') === stat.etag) {
		return new Response(null, { status: 304 });
	}

	let result: Awaited<ReturnType<typeof storage.get>>;
	try {
		result = await storage.get(key);
	} catch {
		error(403, t(locals.locale, 'error.forbidden'));
	}
	if (!result) error(404, t(locals.locale, 'error.fileNotFound'));

	return new Response(result.stream, {
		headers: {
			'Content-Type': photo.mimeType,
			'Content-Length': String(result.stat.size),
			'Cache-Control': 'private, max-age=31536000, immutable',
			ETag: result.stat.etag,
			'X-Content-Type-Options': 'nosniff'
		}
	});
};
