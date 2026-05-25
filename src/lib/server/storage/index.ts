import { LocalBackend } from './local';
import type { StorageBackend } from './types';

export type { BlobStat, GetResult, PutInput, StorageBackend, StorageProvider } from './types';

let backend: StorageBackend = LocalBackend;

export function getStorage(): StorageBackend {
	return backend;
}
