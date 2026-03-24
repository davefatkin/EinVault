import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { localDateISO } from '$lib/date';
import { getEnrichedJournalEntries } from '$lib/server/journal';

export const load: PageServerLoad = async ({ params, locals, parent }) => {
	if (!locals.user) redirect(302, '/auth/login');
	const { companionId } = params;
	const { companion } = await parent();

	const { entries, hasMore, oldestDate } = await getEnrichedJournalEntries(companionId);

	return {
		companion,
		entries,
		today: localDateISO(),
		hasMore,
		oldestDate
	};
};
