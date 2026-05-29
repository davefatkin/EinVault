// Mime types EinVault will accept for journal photos and avatars.
// Conservative on purpose: SVG and ICO can carry active content; HEIC may
// require sharp's libheif which is not always present.
export const ALLOWED_PHOTO_MIME = [
	'image/jpeg',
	'image/png',
	'image/webp',
	'image/gif',
	'image/heic'
] as const;

export const ALLOWED_AVATAR_MIME = ['image/jpeg', 'image/png', 'image/webp'] as const;

// Video formats accepted for journal media. quicktime covers .mov files from
// iPhones. Videos are stored as-is (no transcode), so we keep to the widely
// browser-playable container/codec combinations.
export const ALLOWED_VIDEO_MIME = ['video/mp4', 'video/webm', 'video/quicktime'] as const;

export function isAllowedPhotoMime(mime: string | null | undefined): boolean {
	return !!mime && (ALLOWED_PHOTO_MIME as readonly string[]).includes(mime);
}

export function isAllowedVideoMime(mime: string | null | undefined): boolean {
	return !!mime && (ALLOWED_VIDEO_MIME as readonly string[]).includes(mime);
}

// Lightweight container sniff confirming an accepted video mime actually looks
// like that container, mirroring the GIF magic-byte check on the image path.
// Not a full parse: it just rejects obviously-mislabeled uploads (e.g. an HTML
// document sent as video/mp4) as defense in depth.
export function looksLikeVideo(bytes: Uint8Array, mime: string): boolean {
	if (mime === 'video/webm') {
		// Matroska/WebM EBML header: 1A 45 DF A3
		return (
			bytes.length >= 4 &&
			bytes[0] === 0x1a &&
			bytes[1] === 0x45 &&
			bytes[2] === 0xdf &&
			bytes[3] === 0xa3
		);
	}
	// mp4 / quicktime use the ISO base media format: bytes 4..8 hold the first
	// box type, almost always 'ftyp'. Allow the other common leading boxes too.
	if (bytes.length < 12) return false;
	const box = String.fromCharCode(bytes[4], bytes[5], bytes[6], bytes[7]);
	return ['ftyp', 'moov', 'mdat', 'free', 'skip', 'wide'].includes(box);
}

// Safe lowercase file extension for an accepted video mime type.
export function videoExtFromMime(mime: string): string {
	if (mime === 'video/mp4') return 'mp4';
	if (mime === 'video/webm') return 'webm';
	if (mime === 'video/quicktime') return 'mov';
	return 'mp4';
}

export function isAllowedAvatarMime(mime: string | null | undefined): boolean {
	return !!mime && (ALLOWED_AVATAR_MIME as readonly string[]).includes(mime);
}

// Derive a safe lowercase file extension from a mime type, falling back to
// an extension hinted by the original filename only if it passes a strict
// allowlist regex. Defaults to 'jpg' when nothing is usable.
export function safeExtFromMime(mime: string, originalFileName: string | null | undefined): string {
	const hinted = originalFileName?.split('.').pop()?.toLowerCase();
	if (hinted && /^[a-z0-9]{1,5}$/.test(hinted)) return hinted;
	if (mime === 'image/jpeg') return 'jpg';
	if (mime === 'image/png') return 'png';
	if (mime === 'image/webp') return 'webp';
	if (mime === 'image/gif') return 'gif';
	if (mime === 'image/heic') return 'heic';
	return 'jpg';
}
