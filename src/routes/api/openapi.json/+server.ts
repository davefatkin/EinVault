import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { t } from '#lib/i18n/index.js';
import { API_TOKENS_ENABLED } from '#lib/server/env.js';
import { buildOpenApiDocument } from '#lib/server/openapi/spec.js';

// Public spec (no secrets, just the contract), gated by the same killswitch as
// the rest of the API. Cached for a minute since it's static per build.
export const GET: RequestHandler = ({ locals }) => {
	if (!API_TOKENS_ENABLED) error(404, t(locals.locale, 'error.notFound'), { code: 'notFound' });
	return json(buildOpenApiDocument(), {
		headers: { 'cache-control': 'public, max-age=60' }
	});
};
