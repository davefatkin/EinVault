import { IMMICH_CONFIG, S3_CONFIG, STORAGE_BACKEND } from '$lib/server/env';
import { LocalBackend } from './local';
import { createS3Backend } from './s3';
import { createImmichBackend, createImmichClient, type ImmichClient } from './immich';
import type { StorageBackend, StorageProvider } from './types';

export type {
	BlobStat,
	GetOptions,
	GetResult,
	PutInput,
	StorageBackend,
	StorageProvider
} from './types';

export { immichKey } from './immich';
export type { ImmichAssetSummary, ImmichClient } from './immich';

const backends: Partial<Record<StorageProvider, StorageBackend>> = {
	local: LocalBackend
};

if (S3_CONFIG) {
	backends.s3 = createS3Backend(S3_CONFIG);
}

let immichClient: ImmichClient | null = null;
if (IMMICH_CONFIG) {
	backends.immich = createImmichBackend(IMMICH_CONFIG);
	immichClient = createImmichClient(IMMICH_CONFIG);
}

/**
 * Returns the backend for the given provider. With no argument, returns the
 * write backend configured via STORAGE_BACKEND. Reads should pass the row's
 * `provider` column so that existing local-stored rows continue to work after
 * switching the write backend.
 */
export function getStorage(provider: StorageProvider = STORAGE_BACKEND): StorageBackend {
	const b = backends[provider];
	if (!b) {
		throw new Error(
			`Storage provider '${provider}' is not configured. Existing rows reference this provider — set the matching env vars.`
		);
	}
	return b;
}

export function getImmichClient(): ImmichClient | null {
	return immichClient;
}

export function isImmichEnabled(): boolean {
	return immichClient !== null;
}

export { STORAGE_BACKEND };
