import { error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { t } from '$lib/i18n';
import { getImmichClient, IMMICH_ASSET_ID_RE } from '$lib/server/storage';

export const GET: RequestHandler = async ({ params, url, locals }) => {
	if (!locals.user) error(401, t(locals.locale, 'error.unauthorized'));
	if (locals.user.role === 'caretaker') error(403, t(locals.locale, 'error.forbidden'));

	const client = getImmichClient();
	if (!client) error(404, t(locals.locale, 'error.notFound'));

	const assetId = params.assetId;
	if (!IMMICH_ASSET_ID_RE.test(assetId)) error(400, t(locals.locale, 'error.invalidFileType'));

	const sizeParam = url.searchParams.get('size');
	const size: 'preview' | 'thumbnail' = sizeParam === 'preview' ? 'preview' : 'thumbnail';

	const res = await client.fetchThumbnail(assetId, size);
	if (res.status === 404) error(404, t(locals.locale, 'error.notFound'));
	if (!res.ok || !res.body) {
		console.error(`[immich-thumbnail] upstream status=${res.status} asset=${assetId} size=${size}`);
		error(502, t(locals.locale, 'error.fileNotFound'));
	}

	const contentType = res.headers.get('content-type') ?? 'image/jpeg';
	const contentLength = res.headers.get('content-length');

	const headers: Record<string, string> = {
		'Content-Type': contentType,
		'Cache-Control': 'private, max-age=300',
		'X-Content-Type-Options': 'nosniff'
	};
	if (contentLength) headers['Content-Length'] = contentLength;

	return new Response(res.body, { headers });
};
