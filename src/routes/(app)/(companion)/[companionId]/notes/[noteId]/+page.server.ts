import { error, fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { t } from '$lib/i18n';
import { deleteNote, getNote, listTags, updateNote } from '$lib/server/notes';
import { noteErrorText, noteFieldsFromForm, togglePinAction } from '$lib/server/note-actions';
import { validateNotePatch } from '$lib/notes';

export const load: PageServerLoad = async ({ params, locals, parent, url }) => {
	if (!locals.user) redirect(302, '/auth/login');
	if (locals.user.role === 'caretaker') redirect(302, '/care');
	const { companion } = await parent();
	const note = await getNote(params.noteId, params.companionId);
	if (!note) error(404, t(locals.locale, 'error.noteNotFound'));
	const editing = url.searchParams.get('edit') === '1';
	const suggestions = editing ? (await listTags()).map((r) => r.tag) : [];
	return { companion, note, editing, suggestions };
};

export const actions: Actions = {
	update: async ({ request, params, locals }) => {
		if (!locals.user) return fail(401, { noteError: t(locals.locale, 'error.unauthorized') });
		if (locals.user.role === 'caretaker')
			return fail(403, { noteError: t(locals.locale, 'error.forbidden') });

		const note = await getNote(params.noteId, params.companionId);
		if (!note) return fail(404, { noteError: t(locals.locale, 'error.noteNotFound') });

		const checked = validateNotePatch(noteFieldsFromForm(await request.formData()));
		if (!checked.ok) return fail(400, { noteError: noteErrorText(checked.code, locals.locale) });
		if (!(await updateNote(note.id, checked.value, locals.user.id)))
			return fail(404, { noteError: t(locals.locale, 'error.noteNotFound') });
		redirect(303, `/${params.companionId}/notes/${note.id}`);
	},

	delete: async ({ params, locals }) => {
		if (!locals.user) return fail(401, { noteError: t(locals.locale, 'error.unauthorized') });
		if (locals.user.role === 'caretaker')
			return fail(403, { noteError: t(locals.locale, 'error.forbidden') });

		const note = await getNote(params.noteId, params.companionId);
		if (!note) return fail(404, { noteError: t(locals.locale, 'error.noteNotFound') });
		await deleteNote(note.id);
		redirect(303, `/${params.companionId}/notes`);
	},

	togglePin: togglePinAction
};
