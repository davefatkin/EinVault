import { error, type RequestEvent } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';
import { t } from '$lib/i18n';
import { localDateISO } from '$lib/date';
import { db, schema } from '$lib/server/db';
import { authorizeCompanions } from '$lib/server/companion-scope';
import { throwCareError } from '$lib/server/care-errors';

// Journal media writes (upload, caption edit, delete). Members and admins may
// write for any companion. Caretakers follow the care journal rules: an active
// shift and an assignment to the companion, and when `date` is given (uploads),
// only today's date. Throws via SvelteKit's error() helper on failure; returns
// void on success.
export async function assertCanWriteJournalMedia(
	locals: RequestEvent['locals'],
	companionId: string,
	date?: string
): Promise<void> {
	if (!locals.user) error(401, t(locals.locale, 'error.unauthorized'));
	if (locals.user.role !== 'caretaker') return;
	const scope = await authorizeCompanions(locals.user, [companionId]);
	if (!scope.ok) throwCareError(scope.code, locals.locale);
	if (date !== undefined && date !== localDateISO()) {
		error(403, t(locals.locale, 'error.forbidden'));
	}
}

// Note media writes (upload, Immich import, caption edit, delete, status poll).
// These endpoints live under /api/companions/..., outside every route group the
// hooks guard covers, so this check is their only protection (a missing check
// of this kind is what GHSA-m6gq-2wcm-93vv was). Members and admins may write
// any note's media, archived companions included, because notes stay editable
// in the owner UI. Caretakers never write note media. The note must belong to
// the companion in the URL; anything else is a 404 so ids can't be probed.
export async function assertCanWriteNoteMedia(
	locals: RequestEvent['locals'],
	companionId: string,
	noteId: string
): Promise<{ note: { id: string; companionId: string } }> {
	if (!locals.user) error(401, t(locals.locale, 'error.unauthorized'));
	if (locals.user.role === 'caretaker') error(403, t(locals.locale, 'error.forbidden'));
	const note = await db.query.notes.findFirst({
		where: eq(schema.notes.id, noteId),
		columns: { id: true, companionId: true }
	});
	if (!note || note.companionId !== companionId) {
		error(404, t(locals.locale, 'error.noteNotFound'));
	}
	return { note };
}
