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

export function isAllowedPhotoMime(mime: string | null | undefined): boolean {
	return !!mime && (ALLOWED_PHOTO_MIME as readonly string[]).includes(mime);
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
