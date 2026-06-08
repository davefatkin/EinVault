import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { t } from '$lib/i18n';
import { PAPERLESS_CONFIG } from '$lib/server/env';
import { getPaperlessClient } from '$lib/server/storage';

const DEFAULT_PAGE_SIZE = 60;
const MAX_PAGE_SIZE = 200;
const MAX_QUERY_LENGTH = 200;

export const GET: RequestHandler = async ({ url, locals }) => {
	if (!locals.user) error(401, t(locals.locale, 'error.unauthorized'));
	if (locals.user.role === 'caretaker') error(403, t(locals.locale, 'error.forbidden'));

	const client = getPaperlessClient();
	if (!client || !PAPERLESS_CONFIG) error(404, t(locals.locale, 'error.notFound'));

	const query = (url.searchParams.get('query') ?? '').slice(0, MAX_QUERY_LENGTH);
	const page = Math.max(1, Math.trunc(Number(url.searchParams.get('page')) || 1));
	const pageSizeRaw = Math.trunc(Number(url.searchParams.get('pageSize')) || DEFAULT_PAGE_SIZE);
	const pageSize = Math.min(MAX_PAGE_SIZE, Math.max(1, pageSizeRaw));

	let result;
	try {
		result = await client.searchDocuments({ query, page, pageSize });
	} catch (err) {
		console.error('[paperless-search]', err);
		error(502, t(locals.locale, 'paperless.picker.loadError'));
	}

	// Summaries only — the client already strips `content`/`__search_hit__`,
	// but keep the explicit projection here as the second guard.
	return json({
		items: result.items.map((d) => ({
			id: d.id,
			title: d.title,
			created: d.created,
			archiveSerialNumber: d.archiveSerialNumber
		})),
		hasNextPage: result.hasNextPage,
		page,
		pageSize,
		tagScoped: PAPERLESS_CONFIG.tagId !== null
	});
};
