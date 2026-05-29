// Client-safe helpers for journal media. The server stores photos and videos
// in the same table; the row's mimeType (or mediaType) tells them apart.

/** File input `accept` value for the journal media picker (images + videos). */
export const MEDIA_ACCEPT =
	'image/jpeg,image/png,image/webp,image/gif,video/mp4,video/webm,video/quicktime';

export function isVideoMime(mime: string | null | undefined): boolean {
	return !!mime && mime.startsWith('video/');
}
