import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { t } from '$lib/i18n';
import { search } from '$lib/server/search';

export const GET: RequestHandler = async ({ url, locals }) => {
	if (!locals.user) error(401, t(locals.locale, 'error.unauthorized'));
	// v1: members/admins only. Caretaker results would be limited to content the
	// care UI cannot display (no date navigation); revisit with tags/part 2.
	if (locals.user.role === 'caretaker') error(403, t(locals.locale, 'error.forbidden'));

	const q = url.searchParams.get('q') ?? '';
	try {
		return json({ results: search(q) });
	} catch (err) {
		console.error('[search] query failed:', err);
		return json({ results: [] });
	}
};
