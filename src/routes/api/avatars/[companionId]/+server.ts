import { error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { t } from '$lib/i18n';
import { db, schema } from '$lib/server/db';
import { eq } from 'drizzle-orm';
import { getStorage } from '$lib/server/storage';

export const GET: RequestHandler = async ({ params, locals, request, url }) => {
	if (!locals.user) error(401, t(locals.locale, 'error.unauthorized'));

	const companion = await db.query.companions.findFirst({
		where: eq(schema.companions.id, params.companionId)
	});
	if (!companion?.avatarPath) error(404, t(locals.locale, 'error.noAvatar'));

	const key = `avatars/${companion.avatarPath}`;
	const storage = getStorage();

	const stat = await storage.stat(key);
	if (!stat) error(404, t(locals.locale, 'error.fileNotFound'));

	if (request.headers.get('if-none-match') === stat.etag) {
		return new Response(null, { status: 304 });
	}

	const ext = companion.avatarPath.split('.').pop() ?? 'jpg';
	const mimeType = ext === 'png' ? 'image/png' : ext === 'webp' ? 'image/webp' : 'image/jpeg';

	const hasCacheBuster = url.searchParams.has('t');
	const cacheControl = hasCacheBuster
		? 'private, max-age=31536000, immutable'
		: 'private, no-cache';

	const result = await storage.get(key);
	if (!result) error(404, t(locals.locale, 'error.fileNotFound'));

	return new Response(result.stream, {
		headers: {
			'Content-Type': mimeType,
			'Content-Length': String(result.stat.size),
			'Cache-Control': cacheControl,
			ETag: result.stat.etag,
			'Last-Modified': result.stat.mtime.toUTCString(),
			'X-Content-Type-Options': 'nosniff'
		}
	});
};
