import { fail, redirect } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';
import type { Actions, PageServerLoad } from './$types';
import { t } from '$lib/i18n';
import { db, schema } from '$lib/server/db';
import { createNote, listTags } from '$lib/server/notes';
import { noteErrorText, noteFieldsFromForm } from '$lib/server/note-actions';
import { validateNewNote } from '$lib/notes';

export const load: PageServerLoad = async ({ locals, parent }) => {
	if (!locals.user) redirect(302, '/auth/login');
	if (locals.user.role === 'caretaker') redirect(302, '/care');
	const { companion } = await parent();
	const suggestions = (await listTags()).map((r) => r.tag);
	return { companion, suggestions };
};

export const actions: Actions = {
	create: async ({ request, params, locals }) => {
		if (!locals.user) return fail(401, { noteError: t(locals.locale, 'error.unauthorized') });
		if (locals.user.role === 'caretaker')
			return fail(403, { noteError: t(locals.locale, 'error.forbidden') });

		const companion = await db.query.companions.findFirst({
			where: eq(schema.companions.id, params.companionId),
			columns: { id: true }
		});
		if (!companion) return fail(404, { noteError: t(locals.locale, 'error.companionNotFound') });

		const checked = validateNewNote(noteFieldsFromForm(await request.formData()));
		if (!checked.ok) return fail(400, { noteError: noteErrorText(checked.code, locals.locale) });

		const id = await createNote(params.companionId, checked.value, locals.user.id);
		redirect(303, `/${params.companionId}/notes/${id}`);
	}
};
