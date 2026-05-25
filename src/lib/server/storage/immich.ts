import type { ImmichConfig } from '$lib/server/env';
import type { GetResult, StorageBackend } from './types';

const KEY_PREFIX = 'immich:';
// Immich asset ids are UUIDs. Pin the format so a stored row referencing
// `../../etc/passwd` can never sneak through parseKey.
export const ASSET_ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Default timeout for any single Immich HTTP call. Homelab Immich on LAN
// should reply in well under a second; a hung Immich must not stall workers.
const DEFAULT_TIMEOUT_MS = 8_000;

// Soft cap for album-mode listAssets. Immich's /albums/{id} returns every
// asset in one shot, so a very large album would blow up memory.
const ALBUM_ASSET_CAP = 5_000;

export function immichKey(assetId: string): string {
	return `${KEY_PREFIX}${assetId}`;
}

function parseKey(key: string): string {
	if (!key.startsWith(KEY_PREFIX)) {
		throw new Error(`Immich storage key must start with '${KEY_PREFIX}'`);
	}
	const id = key.slice(KEY_PREFIX.length);
	if (!ASSET_ID_RE.test(id)) {
		throw new Error('Invalid Immich asset id in key');
	}
	return id;
}

function timeoutSignal(ms = DEFAULT_TIMEOUT_MS): AbortSignal {
	return AbortSignal.timeout(ms);
}

// Log full upstream context server-side; return a short generic message so
// callers (and any error.message that bubbles into a response) cannot leak
// API keys, request ids, or bucket names.
async function logAndSanitize(label: string, res: Response, hint: string): Promise<Error> {
	const body = await res.text().catch(() => '');
	console.error(`[immich] ${label} status=${res.status} body=${body.slice(0, 500)}`);
	return new Error(`${hint} (${res.status})`);
}

export function createImmichBackend(config: ImmichConfig): StorageBackend {
	async function fetchAsset(
		assetId: string,
		size: 'preview' | 'thumbnail' | 'original'
	): Promise<Response> {
		const path =
			size === 'original'
				? `/api/assets/${assetId}/original`
				: `/api/assets/${assetId}/thumbnail?size=${size}`;
		return fetch(`${config.url}${path}`, {
			headers: {
				'x-api-key': config.apiKey,
				Accept: 'image/*'
			},
			signal: timeoutSignal()
		});
	}

	return {
		provider: 'immich',

		async put() {
			throw new Error(
				'Immich backend is read-only: use the from-immich endpoints to reference an existing asset.'
			);
		},

		async get(key: string): Promise<GetResult | null> {
			const assetId = parseKey(key);
			// Serve Immich's 'preview' derivative rather than the original.
			// Preview is typically ~1920px and quality-matches the cap EinVault
			// applies to local/S3 uploads. Avoids streaming multi-MB originals
			// for in-app journal views.
			const res = await fetchAsset(assetId, 'preview');
			if (res.status === 404) return null;
			if (!res.ok || !res.body) {
				throw await logAndSanitize(`get asset=${assetId}`, res, 'Immich asset fetch failed');
			}
			const length = Number(res.headers.get('content-length') ?? 0);
			const etag = res.headers.get('etag') ?? `"immich-${assetId}"`;
			const lastModified = res.headers.get('last-modified');
			return {
				kind: 'stream',
				stream: res.body,
				stat: {
					size: length,
					etag,
					mtime: lastModified ? new Date(lastModified) : new Date(0)
				}
			};
		},

		async delete() {
			// Intentional no-op. EinVault stores a reference to an Immich asset;
			// removing the reference must not delete the user's photo from
			// their Immich library.
		}
	};
}

export interface ImmichAssetSummary {
	id: string;
	originalFileName: string;
	originalMimeType: string;
	fileSizeInByte: number | null;
	thumbhash: string | null;
	createdAt: string | null;
	type: string;
}

export interface ImmichClient {
	listAssets(opts: { page: number; pageSize: number; albumId?: string | null }): Promise<{
		items: ImmichAssetSummary[];
		hasNextPage: boolean;
	}>;
	getAsset(assetId: string): Promise<ImmichAssetSummary | null>;
	fetchThumbnail(assetId: string, size: 'preview' | 'thumbnail'): Promise<Response>;
}

interface ImmichAssetResponse {
	id: string;
	originalFileName?: string;
	originalMimeType?: string;
	fileSizeInByte?: number;
	thumbhash?: string;
	fileCreatedAt?: string;
	type?: string;
}

interface ImmichSearchResponse {
	assets?: {
		items?: ImmichAssetResponse[];
		nextPage?: string | null;
	};
}

interface ImmichAlbumResponse {
	assets?: ImmichAssetResponse[];
}

function summarize(a: ImmichAssetResponse): ImmichAssetSummary {
	return {
		id: a.id,
		originalFileName: a.originalFileName ?? '',
		originalMimeType: a.originalMimeType ?? 'application/octet-stream',
		fileSizeInByte: typeof a.fileSizeInByte === 'number' ? a.fileSizeInByte : null,
		thumbhash: a.thumbhash ?? null,
		createdAt: a.fileCreatedAt ?? null,
		type: a.type ?? 'IMAGE'
	};
}

export function createImmichClient(config: ImmichConfig): ImmichClient {
	function headers(): Record<string, string> {
		return { 'x-api-key': config.apiKey, Accept: 'application/json' };
	}

	return {
		async listAssets({ page, pageSize, albumId }) {
			// Album mode: fetch the album once, then page client-side. Immich's
			// /albums/{id} endpoint returns all assets in one response, which is
			// fine for typical homelab album sizes but capped here as a guard
			// against giant albums.
			if (albumId) {
				const res = await fetch(`${config.url}/api/albums/${albumId}`, {
					headers: headers(),
					signal: timeoutSignal()
				});
				if (!res.ok) {
					throw await logAndSanitize(`album=${albumId}`, res, 'Immich album fetch failed');
				}
				const body = (await res.json()) as ImmichAlbumResponse;
				const raw = body.assets ?? [];
				if (raw.length > ALBUM_ASSET_CAP) {
					console.warn(
						`[immich] album ${albumId} has ${raw.length} assets; capping picker to first ${ALBUM_ASSET_CAP}`
					);
				}
				const all = raw
					.slice(0, ALBUM_ASSET_CAP)
					.filter((a) => a.type !== 'VIDEO')
					.map(summarize);
				const start = (page - 1) * pageSize;
				const items = all.slice(start, start + pageSize);
				return { items, hasNextPage: start + pageSize < all.length };
			}

			// No album: use the search endpoint, newest first. Pagination is
			// handled by Immich.
			const res = await fetch(`${config.url}/api/search/metadata`, {
				method: 'POST',
				headers: { ...headers(), 'Content-Type': 'application/json' },
				body: JSON.stringify({
					page,
					size: pageSize,
					type: 'IMAGE',
					order: 'desc'
				}),
				signal: timeoutSignal()
			});
			if (!res.ok) {
				throw await logAndSanitize('search', res, 'Immich search failed');
			}
			const body = (await res.json()) as ImmichSearchResponse;
			const items = (body.assets?.items ?? []).map(summarize);
			const hasNextPage = !!body.assets?.nextPage;
			return { items, hasNextPage };
		},

		async getAsset(assetId: string) {
			const res = await fetch(`${config.url}/api/assets/${assetId}`, {
				headers: headers(),
				signal: timeoutSignal()
			});
			if (res.status === 404) return null;
			if (!res.ok) {
				throw await logAndSanitize(`getAsset=${assetId}`, res, 'Immich asset fetch failed');
			}
			const body = (await res.json()) as ImmichAssetResponse;
			return summarize(body);
		},

		async fetchThumbnail(assetId: string, size: 'preview' | 'thumbnail') {
			return fetch(`${config.url}/api/assets/${assetId}/thumbnail?size=${size}`, {
				headers: { 'x-api-key': config.apiKey, Accept: 'image/*' },
				signal: timeoutSignal()
			});
		}
	};
}
