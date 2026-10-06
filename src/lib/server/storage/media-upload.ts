import { error } from '@sveltejs/kit';
import sharp from 'sharp';
import { t, type Locale } from '$lib/i18n';
import { UPLOAD_MAX_MB, VIDEO_MAX_MB, VIDEO_TRANSCODE } from '$lib/server/env';
import { demuxerForMime, transcodeAvailable } from '$lib/server/video/transcode';
import { isAllowedVideoMime, looksLikeVideo, videoExtFromMime } from './mime';

// Validation and processing shared by every photo/video upload (journal media,
// note media). Throws SvelteKit error(400) with the user-facing message.

const MAX_IMAGE_SIZE = UPLOAD_MAX_MB * 1024 * 1024;
const MAX_VIDEO_SIZE = VIDEO_MAX_MB * 1024 * 1024;
const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];

export type PreparedMedia = {
	body: Buffer;
	contentType: string;
	// `${mediaId}.${ext}`, or `${mediaId}.orig.${ext}` for a source queued for transcoding.
	filename: string;
	mediaType: 'photo' | 'video';
	willTranscode: boolean;
	sizeBytes: number;
};

export async function prepareMediaUpload(
	file: File | null,
	mediaId: string,
	locale: Locale
): Promise<PreparedMedia> {
	if (!file || file.size === 0) error(400, t(locale, 'error.noFileProvided'));

	const isVideo = isAllowedVideoMime(file.type);
	if (!isVideo && !ALLOWED_IMAGE_TYPES.includes(file.type))
		error(400, t(locale, 'error.invalidFileType'));

	if (isVideo) {
		if (file.size > MAX_VIDEO_SIZE)
			error(400, t(locale, 'error.fileTooLarge', { max: VIDEO_MAX_MB }));
	} else if (file.size > MAX_IMAGE_SIZE) {
		error(400, t(locale, 'error.fileTooLarge', { max: UPLOAD_MAX_MB }));
	}

	const raw = Buffer.from(await file.arrayBuffer());
	let processed: Buffer;
	let ext: string;
	let mimeType: string;

	if (isVideo) {
		// Confirm the bytes match the declared container before trusting the
		// client mime type (we store videos as-is, with no re-encode to sanitize).
		if (!looksLikeVideo(raw, file.type)) error(400, t(locale, 'error.invalidFileType'));
		processed = raw;
		ext = videoExtFromMime(file.type);
		mimeType = file.type;
	} else if (file.type === 'image/gif') {
		const sig = raw.slice(0, 6).toString('ascii');
		if (sig !== 'GIF87a' && sig !== 'GIF89a') error(400, t(locale, 'error.invalidGifFile'));
		// Truncate at the GIF terminator byte (0x3B) to strip trailing data
		const termIdx = raw.lastIndexOf(0x3b);
		processed = termIdx !== -1 ? raw.slice(0, termIdx + 1) : raw;
		ext = 'gif';
		mimeType = 'image/gif';
	} else {
		processed = await sharp(raw)
			.resize(1920, 1920, { fit: 'inside', withoutEnlargement: true })
			.jpeg({ quality: 85 })
			.toBuffer();
		ext = 'jpg';
		mimeType = 'image/jpeg';
	}

	// Queue a video for background transcoding when the feature is enabled,
	// ffmpeg is present, the container is supported, and the clip is within the
	// transcode size cap. Anything else is stored as-is.
	const willTranscode =
		isVideo &&
		demuxerForMime(mimeType) !== null &&
		processed.length <= VIDEO_TRANSCODE.maxMb * 1024 * 1024 &&
		(await transcodeAvailable());

	// A to-be-transcoded source is stored under a sentinel '.orig.' name so its
	// key can never collide with the worker's output ('{mediaId}.mp4'). Without
	// this, an mp4-container source would share the output key: the transcode
	// would overwrite the kept original, or, with KEEP_ORIGINAL off, the
	// post-transcode cleanup would delete the output itself.
	const filename = willTranscode ? `${mediaId}.orig.${ext}` : `${mediaId}.${ext}`;

	return {
		body: processed,
		contentType: mimeType,
		filename,
		mediaType: isVideo ? 'video' : 'photo',
		willTranscode,
		sizeBytes: processed.length
	};
}
