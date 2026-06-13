import { error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { t } from '$lib/i18n';
import { db, schema } from '$lib/server/db';
import { eq } from 'drizzle-orm';
import { getStorage, type GetResult } from '$lib/server/storage';
import type { StorageProvider } from '$lib/server/storage/types';

export const GET: RequestHandler = async ({ params, locals, request, url }) => {
	if (!locals.user) error(401, t(locals.locale, 'error.unauthorized'));

	const user = await db.query.users.findFirst({
		where: eq(schema.users.id, params.userId),
		columns: { avatarPath: true, avatarProvider: true, avatarStorageKey: true }
	});
	if (!user?.avatarPath) error(404, t(locals.locale, 'error.noAvatar'));

	const provider = (user.avatarProvider ?? 'local') as StorageProvider;
	const key = user.avatarStorageKey ?? `avatars/${user.avatarPath}`;
	const ifNoneMatch = request.headers.get('if-none-match');

	let res: GetResult | null;
	try {
		res = await getStorage(provider).get(key, { ifNoneMatch });
	} catch (err) {
		if (err instanceof Error && err.message.includes('escapes upload root')) {
			error(403, t(locals.locale, 'error.forbidden'));
		}
		console.error(`[user-avatars] storage error provider=${user.avatarProvider} key=${key}:`, err);
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

	const ext = user.avatarPath.split('.').pop() ?? 'jpg';
	const mimeType = ext === 'png' ? 'image/png' : ext === 'webp' ? 'image/webp' : 'image/jpeg';

	const hasCacheBuster = url.searchParams.has('t');
	const cacheControl =
		provider === 'immich'
			? 'private, max-age=300'
			: hasCacheBuster
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
