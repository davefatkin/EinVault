// Client adapters between the media UI and the media endpoints. Journal and
// note media use different URLs, form fields and caption keys; components only
// see MediaApi and MediaItem. Built from plain closures (no `this`), so a
// method like `api.urlFor` can be passed around on its own.
import { t, type Locale } from '$lib/i18n';
import {
	journalMediaUrl,
	noteMediaUrl,
	toMediaItem,
	type MediaItem,
	type MediaItemSource,
	type MediaStatus
} from '$lib/media';

type FetchInit = NonNullable<Parameters<typeof fetch>[1]>;

export type MediaApi = {
	/** Uploads one file. Throws Error(message) on failure. */
	upload(file: File): Promise<MediaItem>;
	remove(id: string): Promise<void>;
	setCaption(id: string, caption: string): Promise<void>;
	importImmich(assetId: string): Promise<MediaItem>;
	status(): Promise<MediaStatus[]>;
	urlFor(item: MediaItem): string;
	/** Message for the client-side cap check, matching the server's. */
	capMessage(max: number): string;
};

async function failureMessage(res: Response, fallback: string): Promise<string> {
	try {
		const body: unknown = await res.json();
		if (
			body &&
			typeof body === 'object' &&
			'message' in body &&
			typeof body.message === 'string' &&
			body.message
		) {
			return body.message;
		}
	} catch {
		// not JSON
	}
	return fallback;
}

async function request(url: string, init: FetchInit | undefined, fallback: string) {
	let res: Response;
	try {
		res = await fetch(url, init);
	} catch {
		throw new Error(fallback);
	}
	if (!res.ok) throw new Error(await failureMessage(res, fallback));
	return res;
}

function jsonInit(method: string, body: unknown): FetchInit {
	return {
		method,
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify(body)
	};
}

function toStatus(s: MediaStatus): MediaStatus {
	return { id: s.id, status: s.status, filename: s.filename, posterKey: s.posterKey ?? null };
}

export function journalMediaApi(companionId: string, date: string, locale: Locale): MediaApi {
	const base = `/api/companions/${companionId}/journal/${date}/photos`;
	const failed = t(locale, 'media.uploadFailed');
	const itemUrl = (id: string) => `${base}?photoId=${encodeURIComponent(id)}`;
	return {
		upload: async (file) => {
			const fd = new FormData();
			fd.set('photo', file);
			const res = await request(base, { method: 'POST', body: fd }, failed);
			return toMediaItem((await res.json()) as MediaItemSource);
		},
		remove: async (id) => {
			await request(itemUrl(id), { method: 'DELETE' }, failed);
		},
		setCaption: async (id, caption) => {
			await request(itemUrl(id), jsonInit('PATCH', { notes: caption }), failed);
		},
		importImmich: async (assetId) => {
			const res = await request(
				`${base}/from-immich`,
				jsonInit('POST', { assetId }),
				t(locale, 'immich.picker.pickFailed')
			);
			return toMediaItem((await res.json()) as MediaItemSource);
		},
		status: async () => {
			const res = await request(base, undefined, failed);
			const body = (await res.json()) as { photos: MediaStatus[] };
			return body.photos.map(toStatus);
		},
		urlFor: (item) => journalMediaUrl(companionId, date, item),
		capMessage: (max) => t(locale, 'error.maxMediaExceeded', { max })
	};
}

export function noteMediaApi(companionId: string, noteId: string, locale: Locale): MediaApi {
	const base = `/api/companions/${companionId}/notes/${noteId}/media`;
	const failed = t(locale, 'media.uploadFailed');
	const itemUrl = (id: string) => `${base}?mediaId=${encodeURIComponent(id)}`;
	return {
		upload: async (file) => {
			const fd = new FormData();
			fd.set('file', file);
			const res = await request(base, { method: 'POST', body: fd }, failed);
			return toMediaItem((await res.json()) as MediaItemSource);
		},
		remove: async (id) => {
			await request(itemUrl(id), { method: 'DELETE' }, failed);
		},
		setCaption: async (id, caption) => {
			await request(itemUrl(id), jsonInit('PATCH', { caption }), failed);
		},
		importImmich: async (assetId) => {
			const res = await request(
				`${base}/from-immich`,
				jsonInit('POST', { assetId }),
				t(locale, 'immich.picker.pickFailed')
			);
			return toMediaItem((await res.json()) as MediaItemSource);
		},
		status: async () => {
			const res = await request(base, undefined, failed);
			const body = (await res.json()) as { media: MediaStatus[] };
			return body.media.map(toStatus);
		},
		urlFor: (item) => noteMediaUrl(companionId, noteId, item),
		capMessage: (max) => t(locale, 'error.maxNoteMediaExceeded', { max })
	};
}
