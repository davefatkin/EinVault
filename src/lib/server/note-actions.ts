import { fail, type Action } from '@sveltejs/kit';
import { t, type Locale } from '$lib/i18n';
import { NOTE_ERROR, splitTagInput, type NoteErrorCode, type NoteFieldsInput } from '$lib/notes';
import { getNote, setPinned } from '$lib/server/notes';

// Every field is always present: an unchecked box and an empty tag list submit
// nothing, which must mean "off" / "no tags", not "unchanged". Text typed into
// the tag box but not yet committed arrives as tagsPending and is kept apart
// here, so a failed no-JS submit can re-fill the editor with it as text.
export function noteFormValues(data: FormData) {
	return {
		title: String(data.get('title') ?? ''),
		body: String(data.get('body') ?? ''),
		tags: data.getAll('tags').map(String),
		tagsPending: String(data.get('tagsPending') ?? ''),
		pinned: data.get('pinned') === 'on',
		sharedWithCaretakers: data.get('shared') === 'on'
	};
}

export type NoteFormValues = ReturnType<typeof noteFormValues>;

// Failure for the create and update actions. Every failure has the same shape,
// so pages can read form.values without narrowing.
export function noteFail(status: number, noteError: string, values?: NoteFormValues) {
	return fail(status, { noteError, values });
}

// Validation input: pending tag text counts as tags.
export function noteFieldsFromForm(data: FormData): Required<NoteFieldsInput> {
	const { tags, tagsPending, ...rest } = noteFormValues(data);
	return { ...rest, tags: [...tags, ...splitTagInput(tagsPending)] };
}

export function noteErrorText(code: NoteErrorCode, locale: Locale): string {
	const { key, params } = NOTE_ERROR[code];
	return t(locale, key, params);
}

export const togglePinAction: Action<{ companionId: string }> = async ({
	request,
	params,
	locals
}) => {
	if (!locals.user) return fail(401, { noteError: t(locals.locale, 'error.unauthorized') });
	if (locals.user.role === 'caretaker')
		return fail(403, { noteError: t(locals.locale, 'error.forbidden') });

	const data = await request.formData();
	const id = String(data.get('id') ?? '');
	const note = id ? await getNote(id, params.companionId) : null;
	if (!note || !(await setPinned(note.id, data.get('pinned') === 'true')))
		return fail(404, { noteError: t(locals.locale, 'error.noteNotFound') });
	return { pinned: data.get('pinned') === 'true' };
};
