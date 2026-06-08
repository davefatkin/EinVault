import { error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { t } from '$lib/i18n';
import { getPaperlessClient, PAPERLESS_DOC_ID_RE } from '$lib/server/storage';

export const GET: RequestHandler = async ({ params, locals }) => {
	if (!locals.user) error(401, t(locals.locale, 'error.unauthorized'));
	if (locals.user.role === 'caretaker') error(403, t(locals.locale, 'error.forbidden'));

	const client = getPaperlessClient();
	if (!client) error(404, t(locals.locale, 'error.notFound'));

	const docId = params.docId;
	if (!PAPERLESS_DOC_ID_RE.test(docId)) error(404, t(locals.locale, 'error.notFound'));

	let res: Response;
	try {
		res = await client.fetchThumbnail(docId);
	} catch (err) {
		console.error(`[paperless-thumb] upstream fetch failed doc=${docId}:`, err);
		error(502, t(locals.locale, 'error.fileNotFound'));
	}
	if (res.status === 404) error(404, t(locals.locale, 'error.notFound'));
	if (!res.ok || !res.body) {
		console.error(`[paperless-thumb] upstream status=${res.status} doc=${docId}`);
		error(502, t(locals.locale, 'error.fileNotFound'));
	}

	// Headers built from scratch — never pass upstream headers through.
	const contentType = res.headers.get('content-type') ?? 'image/webp';
	const headers: Record<string, string> = {
		'Content-Type': contentType.startsWith('image/') ? contentType : 'image/webp',
		'Cache-Control': 'private, max-age=300',
		'X-Content-Type-Options': 'nosniff',
		'Content-Security-Policy': 'sandbox'
	};

	return new Response(res.body, { headers });
};
