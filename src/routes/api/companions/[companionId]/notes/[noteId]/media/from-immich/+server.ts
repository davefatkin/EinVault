import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { t } from '$lib/i18n';
import { noteMediaUrl } from '$lib/media';
import { generateId } from '$lib/server/utils';
import { getImmichClient, immichKey, IMMICH_ASSET_ID_RE } from '$lib/server/storage';
import { isAllowedPhotoMime, safeExtFromMime } from '$lib/server/storage/mime';
import { MAX_NOTE_MEDIA } from '$lib/server/env';
import { assertCanWriteNoteMedia } from '$lib/server/permissions';
import { getNoteMediaView, insertNoteMedia } from '$lib/server/note-media';

// Attach an Immich photo to a note. No bytes are stored: the row points at the
// asset and /api/photos proxies Immich's preview. Photos only, since the
// Immich picker lists images only.
export const POST: RequestHandler = async ({ request, params, locals }) => {
	const { companionId, noteId } = params;
	await assertCanWriteNoteMedia(locals, companionId, noteId);

	const client = getImmichClient();
	if (!client) error(404, t(locals.locale, 'error.notFound'));

	const body = (await request.json().catch(() => null)) as { assetId?: string } | null;
	const assetId = body?.assetId?.trim();
	if (!assetId || !IMMICH_ASSET_ID_RE.test(assetId)) {
		error(400, t(locals.locale, 'error.invalidFileType'));
	}

	const asset = await client.getAsset(assetId);
	if (!asset) error(404, t(locals.locale, 'error.notFound'));
	if (!isAllowedPhotoMime(asset.originalMimeType)) {
		error(400, t(locals.locale, 'error.invalidFileType'));
	}

	const mediaId = generateId(15);
	const filename = `${mediaId}.${safeExtFromMime(asset.originalMimeType, asset.originalFileName)}`;
	const outcome = insertNoteMedia(
		{
			id: mediaId,
			noteId,
			filename,
			provider: 'immich',
			storageKey: immichKey(assetId),
			originalName: asset.originalFileName || null,
			mediaType: 'photo',
			mimeType: asset.originalMimeType,
			sizeBytes: asset.fileSizeInByte ?? 0,
			loggedBy: locals.user!.id
		},
		MAX_NOTE_MEDIA
	);
	if (outcome === 'noteGone') error(404, t(locals.locale, 'error.noteNotFound'));
	if (outcome === 'cap') {
		error(400, t(locals.locale, 'error.maxNoteMediaExceeded', { max: MAX_NOTE_MEDIA }));
	}

	const item = await getNoteMediaView(noteId, mediaId);
	if (!item) error(404, t(locals.locale, 'error.photoNotFound'));
	return json({ ...item, url: noteMediaUrl(companionId, noteId, item) });
};
