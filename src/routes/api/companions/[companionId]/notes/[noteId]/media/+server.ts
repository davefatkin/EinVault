import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { t } from '$lib/i18n';
import { noteMediaUrl } from '$lib/media';
import { generateId } from '$lib/server/utils';
import { MAX_NOTE_MEDIA } from '$lib/server/env';
import { assertCanWriteNoteMedia } from '$lib/server/permissions';
import { prepareMediaUpload } from '$lib/server/storage/media-upload';
import { kickWorker } from '$lib/server/video/worker';
import {
	countNoteMedia,
	deleteNoteMediaItem,
	getNoteMediaItem,
	getNoteMediaView,
	listNoteMediaStatus,
	saveNoteMediaUpload,
	setNoteMediaCaption
} from '$lib/server/note-media';

// Session-only endpoint for note media (issue #321). It sits outside every
// route group routeGroupGuard covers, so each handler starts with
// assertCanWriteNoteMedia: members and admins only, note must match the
// companion in the URL. demoReadOnly and twoFactorGate still apply via hooks.

// Transcode status poll for the note view page.
export const GET: RequestHandler = async ({ params, locals }) => {
	await assertCanWriteNoteMedia(locals, params.companionId, params.noteId);
	return json({ media: await listNoteMediaStatus(params.noteId) });
};

export const POST: RequestHandler = async ({ request, params, locals }) => {
	const { companionId, noteId } = params;
	await assertCanWriteNoteMedia(locals, companionId, noteId);
	const userId = locals.user!.id;

	// Cheap early rejection; saveNoteMediaUpload re-checks under the write lock.
	if ((await countNoteMedia(noteId)) >= MAX_NOTE_MEDIA) {
		error(400, t(locals.locale, 'error.maxNoteMediaExceeded', { max: MAX_NOTE_MEDIA }));
	}

	const formData = await request.formData();
	const entry = formData.get('file');
	const file = entry instanceof File ? entry : null;

	const mediaId = generateId(15);
	const prepared = await prepareMediaUpload(file, mediaId, locals.locale);
	const outcome = await saveNoteMediaUpload({
		companionId,
		noteId,
		mediaId,
		prepared,
		originalName: file?.name ?? null,
		loggedBy: userId,
		max: MAX_NOTE_MEDIA
	});
	if (outcome === 'putFailed') error(502, t(locals.locale, 'error.fileNotFound'));
	if (outcome === 'noteGone') error(404, t(locals.locale, 'error.noteNotFound'));
	if (outcome === 'cap') {
		error(400, t(locals.locale, 'error.maxNoteMediaExceeded', { max: MAX_NOTE_MEDIA }));
	}

	if (prepared.willTranscode) kickWorker();

	const item = await getNoteMediaView(noteId, mediaId);
	if (!item) error(404, t(locals.locale, 'error.photoNotFound'));
	return json({ ...item, url: noteMediaUrl(companionId, noteId, item) });
};

export const PATCH: RequestHandler = async ({ url, request, params, locals }) => {
	await assertCanWriteNoteMedia(locals, params.companionId, params.noteId);

	const item = await getNoteMediaItem(params.noteId, url.searchParams.get('mediaId') ?? '');
	if (!item) error(404, t(locals.locale, 'error.photoNotFound'));

	const contentLength = parseInt(request.headers.get('content-length') ?? '0');
	if (contentLength > 10_000) error(400, t(locals.locale, 'error.requestBodyTooLarge'));
	const body = (await request.json().catch(() => null)) as { caption?: unknown } | null;
	const caption = typeof body?.caption === 'string' ? body.caption : '';

	await setNoteMediaCaption(item.id, caption);
	return new Response(null, { status: 204 });
};

export const DELETE: RequestHandler = async ({ url, params, locals }) => {
	await assertCanWriteNoteMedia(locals, params.companionId, params.noteId);

	const item = await getNoteMediaItem(params.noteId, url.searchParams.get('mediaId') ?? '');
	if (!item) error(404, t(locals.locale, 'error.photoNotFound'));

	await deleteNoteMediaItem(item);
	return new Response(null, { status: 204 });
};
