import { redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { listNotes, listTags } from '$lib/server/notes';
import { togglePinAction } from '$lib/server/note-actions';
import { normalizeTag } from '$lib/notes';

export const load: PageServerLoad = async ({ params, locals, parent, url }) => {
	if (!locals.user) redirect(302, '/auth/login');
	if (locals.user.role === 'caretaker') redirect(302, '/care');
	const { companion } = await parent();

	const rawTag = url.searchParams.get('tag');
	const tag = rawTag === null ? null : normalizeTag(rawTag);
	const [notes, tags] = await Promise.all([
		// A ?tag= that can't be a valid tag matches nothing.
		rawTag !== null && tag === null
			? Promise.resolve([])
			: listNotes(params.companionId, { tag: tag ?? undefined }),
		listTags(params.companionId)
	]);
	return { companion, notes, tags, activeTag: rawTag === null ? null : (tag ?? rawTag) };
};

export const actions: Actions = { togglePin: togglePinAction };
