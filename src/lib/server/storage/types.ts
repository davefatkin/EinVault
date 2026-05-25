export type StorageProvider = 'local' | 's3' | 'immich';

export interface PutInput {
	key: string;
	body: Buffer;
	contentType: string;
}

export interface BlobStat {
	size: number;
	etag: string;
	mtime: Date;
}

export type GetResult =
	| { kind: 'stream'; stream: ReadableStream; stat: BlobStat }
	| { kind: 'redirect'; url: string; cacheSeconds: number }
	| { kind: 'notModified'; etag: string };

export interface GetOptions {
	ifNoneMatch?: string | null;
}

export interface StorageBackend {
	readonly provider: StorageProvider;
	put(input: PutInput): Promise<{ key: string }>;
	get(key: string, opts?: GetOptions): Promise<GetResult | null>;
	delete(key: string): Promise<void>;
}
