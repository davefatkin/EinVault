import type { UserRef } from '$lib/types';

// Client-safe helpers for journal and note media. The server stores photos and videos
// in the same table; the row's mimeType (or mediaType) tells them apart.

/** File input `accept` value for the journal media picker (images + videos). */
export const MEDIA_ACCEPT =
	'image/jpeg,image/png,image/webp,image/gif,video/mp4,video/webm,video/quicktime';

export function isVideoMime(mime: string | null | undefined): boolean {
	return !!mime && mime.startsWith('video/');
}

/**
 * One photo or video as the UI sees it, for journal and note media alike.
 * Journal rows map their `notes` column to `caption`. Server loads select only
 * these fields so storage keys never reach the browser.
 */
export type MediaItem = {
	id: string;
	filename: string;
	originalName: string | null;
	mediaType: 'photo' | 'video';
	caption: string | null;
	status: 'ready' | 'processing' | 'claimed' | 'failed';
	posterKey: string | null;
	loggedBy: string | null;
	logger: UserRef; // UserRef already includes null
};

/** One row of the transcode status poll. */
export type MediaStatus = Pick<MediaItem, 'id' | 'status' | 'filename' | 'posterKey'>;

/**
 * A media row selection from either table: note media carries `caption`,
 * journal media carries `notes`. `status` and `logger` may be left out.
 */
export type MediaItemSource = Pick<
	MediaItem,
	'id' | 'filename' | 'originalName' | 'mediaType' | 'posterKey' | 'loggedBy'
> & {
	caption?: string | null;
	notes?: string | null;
	status?: MediaItem['status'];
	logger?: UserRef;
};

/** Build a MediaItem with exactly its own fields, dropping anything else on the row. */
export function toMediaItem(row: MediaItemSource): MediaItem {
	return {
		id: row.id,
		filename: row.filename,
		originalName: row.originalName,
		mediaType: row.mediaType,
		caption: row.caption ?? row.notes ?? null,
		status: row.status ?? 'ready',
		posterKey: row.posterKey,
		loggedBy: row.loggedBy,
		logger: row.logger ?? null
	};
}

export function noteMediaUrl(
	companionId: string,
	noteId: string,
	item: Pick<MediaItem, 'filename'>
): string {
	return `/api/photos/notes/${companionId}/${noteId}/${item.filename}`;
}

export function journalMediaUrl(
	companionId: string,
	date: string,
	item: Pick<MediaItem, 'filename'>
): string {
	return `/api/photos/journal/${companionId}/${date}/${item.filename}`;
}
