export type StorageProvider = 'local';

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

export interface GetResult {
	stream: ReadableStream;
	stat: BlobStat;
}

export interface StorageBackend {
	readonly provider: StorageProvider;
	put(input: PutInput): Promise<{ key: string }>;
	get(key: string): Promise<GetResult | null>;
	stat(key: string): Promise<BlobStat | null>;
	delete(key: string): Promise<void>;
}
