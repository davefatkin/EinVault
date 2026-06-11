import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { t } from '$lib/i18n';
import { search, SEARCH_ENTITY_TYPES } from '$lib/server/search';
import type { SearchEntityType } from '$lib/server/search';

export const GET: RequestHandler = async ({ url, locals }) => {
	if (!locals.user) error(401, t(locals.locale, 'error.unauthorized'));
	// v1: members/admins only. Caretaker results would be limited to content the
	// care UI cannot display (no date navigation); revisit with tags/part 2.
	if (locals.user.role === 'caretaker') error(403, t(locals.locale, 'error.forbidden'));

	const text = url.searchParams.get('q') ?? '';
	const companionIds = url.searchParams.getAll('companionId');
	const rawTypes = url.searchParams.getAll('type');
	const types = rawTypes.filter((t): t is SearchEntityType =>
		(SEARCH_ENTITY_TYPES as readonly string[]).includes(t)
	);
	const after = url.searchParams.get('after') ?? undefined;
	const before = url.searchParams.get('before') ?? undefined;

	try {
		return json({ results: search({ text, companionIds, types, after, before }) });
	} catch (err) {
		console.error('[search] query failed:', err);
		return json({ results: [] });
	}
};
