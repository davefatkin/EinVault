import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { t } from '$lib/i18n';
import { isValidDate } from '$lib/server/validation';
import { getEnrichedJournalEntries } from '$lib/server/journal';

export const GET: RequestHandler = async ({ params, url, locals }) => {
	if (!locals.user) error(401, t(locals.locale, 'error.unauthorized'));

	const { companionId } = params;
	const beforeParam = url.searchParams.get('before');
	if (beforeParam !== null && !isValidDate(beforeParam))
		error(400, t(locals.locale, 'error.invalidBeforeDate'));
	const before = beforeParam ?? undefined;

	const { entries, hasMore, oldestDate } = await getEnrichedJournalEntries(companionId, {
		before
	});

	return json({ entries, hasMore, oldestDate });
};
