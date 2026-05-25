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

	const key = companion.avatarStorageKey ?? `avatars/${companion.avatarPath}`;
	const ifNoneMatch = request.headers.get('if-none-match');

	let res: Awaited<ReturnType<ReturnType<typeof getStorage>['get']>>;
	try {
		res = await getStorage(companion.avatarProvider).get(key, { ifNoneMatch });
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

	const ext = companion.avatarPath.split('.').pop() ?? 'jpg';
	const mimeType = ext === 'png' ? 'image/png' : ext === 'webp' ? 'image/webp' : 'image/jpeg';

	const hasCacheBuster = url.searchParams.has('t');
	const cacheControl = hasCacheBuster
		? 'private, max-age=31536000, immutable'
		: 'private, no-cache';

	return new Response(res.stream, {
		headers: {
			'Content-Type': mimeType,
			'Content-Length': String(res.stat.size),
			'Cache-Control': cacheControl,
			ETag: res.stat.etag,
			'Last-Modified': res.stat.mtime.toUTCString(),
			'X-Content-Type-Options': 'nosniff'
		}
	});
};
