// Media columns that build a MediaItem (see toMediaItem in #lib/media). Loads
// and responses that feed the browser select only these, so storage keys and
// provider never leave the server. Never add storage keys or provider here.
export const MEDIA_ITEM_COLUMNS = {
	id: true,
	filename: true,
	originalName: true,
	mediaType: true,
	caption: true,
	status: true,
	posterKey: true,
	loggedBy: true
} as const;

export const WITH_LOGGER = { logger: { columns: { displayName: true } } } as const;
