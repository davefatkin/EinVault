import { redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { listNotes, listTags } from '$lib/server/notes';
import { togglePinAction } from '$lib/server/note-actions';
import { NOTE_FILTER_MAX_TAGS, buildTagFilter, tagFilterMatchesNothing } from '$lib/notes';

export const load: PageServerLoad = async ({ params, locals, parent, url }) => {
	if (!locals.user) redirect(302, '/auth/login');
	if (locals.user.role === 'caretaker') redirect(302, '/care');
	const { companion } = await parent();

	// Lenient where GET /api/notes is strict: extra tags are dropped and any
	// match other than 'all' reads as 'any'.
	const filter = buildTagFilter(
		url.searchParams.getAll('tag').slice(0, NOTE_FILTER_MAX_TAGS),
		url.searchParams.get('match') === 'all' ? 'all' : 'any'
	);
	const [notes, tags] = await Promise.all([
		tagFilterMatchesNothing(filter)
			? Promise.resolve([])
			: listNotes(params.companionId, { tags: filter.tags, match: filter.match }),
		listTags(params.companionId)
	]);
	return {
		companion,
		notes,
		tags,
		selectedTags: filter.tags,
		match: filter.match,
		filtered: filter.rawCount > 0,
		manyRequested: filter.rawCount >= 2
	};
};

export const actions: Actions = { togglePin: togglePinAction };
