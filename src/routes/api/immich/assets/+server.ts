import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { t } from '$lib/i18n';
import { IMMICH_CONFIG } from '$lib/server/env';
import { getImmichClient } from '$lib/server/storage';

const DEFAULT_PAGE_SIZE = 60;
const MAX_PAGE_SIZE = 200;

export const GET: RequestHandler = async ({ url, locals }) => {
	if (!locals.user) error(401, t(locals.locale, 'error.unauthorized'));
	if (locals.user.role === 'caretaker') error(403, t(locals.locale, 'error.forbidden'));

	const client = getImmichClient();
	if (!client || !IMMICH_CONFIG) error(404, t(locals.locale, 'error.notFound'));

	const page = Math.max(1, Number(url.searchParams.get('page')) || 1);
	const pageSizeRaw = Number(url.searchParams.get('pageSize')) || DEFAULT_PAGE_SIZE;
	const pageSize = Math.min(MAX_PAGE_SIZE, Math.max(1, pageSizeRaw));

	const result = await client.listAssets({
		page,
		pageSize,
		albumId: IMMICH_CONFIG.albumId
	});

	return json({
		items: result.items,
		hasNextPage: result.hasNextPage,
		page,
		pageSize,
		albumScoped: !!IMMICH_CONFIG.albumId
	});
};
