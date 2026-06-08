export type StorageProvider = 'local' | 's3' | 'immich' | 'paperless';

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
	| {
			kind: 'stream';
			stream: ReadableStream;
			stat: BlobStat;
			// Present when the response satisfies a byte-range request (HTTP 206).
			// `total` is the full object size; `start`/`end` are inclusive offsets.
			range?: { start: number; end: number; total: number };
	  }
	| { kind: 'redirect'; url: string; cacheSeconds: number }
	| { kind: 'notModified'; etag: string };

export interface GetOptions {
	ifNoneMatch?: string | null;
	// Raw value of the request's `Range` header, if any. Backends that can serve
	// partial content (local files) honor it; others ignore it.
	range?: string | null;
}

export interface StorageBackend {
	readonly provider: StorageProvider;
	put(input: PutInput): Promise<{ key: string }>;
	get(key: string, opts?: GetOptions): Promise<GetResult | null>;
	delete(key: string): Promise<void>;
}
