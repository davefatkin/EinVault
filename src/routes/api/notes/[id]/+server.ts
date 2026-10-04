import { json } from '@sveltejs/kit';
import { apiRoute, apiRouteZod } from '$lib/server/auth/api-request';
import { deleteNote, getNote, updateNote } from '$lib/server/notes';
import { toApiNote } from '$lib/server/api-serializers';
import { NoteUpdate } from '$lib/server/openapi/schemas';
import { validateNotePatch } from '$lib/notes';
import {
	loadAllowedNote,
	noteCodeFor,
	requireNoteOwnerScope,
	throwNoteError
} from '$lib/server/notes-api';

export const GET = apiRoute(async ({ event, user, scope, locale }) => {
	requireNoteOwnerScope(scope, user, locale);
	const note = await loadAllowedNote(event.params.id!, user, locale);
	return json(toApiNote(note));
});

// PATCH: partial update. Naturally idempotent; `tags` replaces the whole set.
export const PATCH = apiRouteZod(
	NoteUpdate,
	async ({ event, user, scope, locale, body }) => {
		requireNoteOwnerScope(scope, user, locale);
		const note = await loadAllowedNote(event.params.id!, user, locale);
		const checked = validateNotePatch(body);
		if (!checked.ok) throwNoteError(checked.code, locale);
		await updateNote(note.id, checked.value, user.id);
		const updated = await getNote(note.id);
		return json(toApiNote(updated!));
	},
	noteCodeFor
);

// DELETE is not idempotent: a retry after a lost response gets 404.
export const DELETE = apiRoute(async ({ event, user, scope, locale }) => {
	requireNoteOwnerScope(scope, user, locale);
	const note = await loadAllowedNote(event.params.id!, user, locale);
	await deleteNote(note.id);
	return new Response(null, { status: 204 });
});
