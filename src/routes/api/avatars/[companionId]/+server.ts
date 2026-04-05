import { error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { t } from '$lib/i18n';
import { db, schema } from '$lib/server/db';
import { eq } from 'drizzle-orm';
import { createReadStream } from 'fs';
import { Readable } from 'stream';
import { stat } from 'fs/promises';
import { join, resolve } from 'path';
import { DATA_DIR } from '$lib/server/paths';

export const GET: RequestHandler = async ({ params, locals, request, url }) => {
	if (!locals.user) error(401, t(locals.locale, 'error.unauthorized'));

	const companion = await db.query.companions.findFirst({
		where: eq(schema.companions.id, params.companionId)
	});
	if (!companion?.avatarPath) error(404, t(locals.locale, 'error.noAvatar'));

	const fullPath = join(DATA_DIR, 'uploads', 'avatars', companion.avatarPath);

	// Path traversal guard
	const safeBase = resolve(join(DATA_DIR, 'uploads', 'avatars'));
	if (!resolve(fullPath).startsWith(safeBase)) error(403, t(locals.locale, 'error.forbidden'));

	let fileStat: Awaited<ReturnType<typeof stat>>;
	try {
		fileStat = await stat(fullPath);
	} catch {
		error(404, t(locals.locale, 'error.fileNotFound'));
	}

	const etag = `"${fileStat.mtimeMs.toString(36)}-${fileStat.size.toString(36)}"`;

	// Return 304 if client already has this version
	if (request.headers.get('if-none-match') === etag) {
		return new Response(null, { status: 304 });
	}

	const ext = companion.avatarPath.split('.').pop() ?? 'jpg';
	const mimeType = ext === 'png' ? 'image/png' : ext === 'webp' ? 'image/webp' : 'image/jpeg';

	// Cache indefinitely when URL has a cache-buster (?t=...), otherwise rely on ETag revalidation
	const hasCacheBuster = url.searchParams.has('t');
	const cacheControl = hasCacheBuster
		? 'private, max-age=31536000, immutable'
		: 'private, no-cache';

	return new Response(Readable.toWeb(createReadStream(fullPath)) as ReadableStream, {
		headers: {
			'Content-Type': mimeType,
			'Content-Length': String(fileStat.size),
			'Cache-Control': cacheControl,
			ETag: etag,
			'Last-Modified': fileStat.mtime.toUTCString(),
			'X-Content-Type-Options': 'nosniff'
		}
	});
};
