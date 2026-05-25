import { AwsClient } from 'aws4fetch';
import type { S3Config } from '$lib/server/env';
import type { GetResult, PutInput, StorageBackend } from './types';

function encodeKey(key: string): string {
	// S3 keys can contain `/` as a literal character. Encode each segment so
	// special characters in filenames are safe, but preserve segment boundaries.
	return key
		.split('/')
		.map((seg) => encodeURIComponent(seg))
		.join('/');
}

export function createS3Backend(config: S3Config): StorageBackend {
	const aws = new AwsClient({
		accessKeyId: config.accessKeyId,
		secretAccessKey: config.secretAccessKey,
		region: config.region,
		service: 's3'
	});

	const endpoint = new URL(config.endpoint);

	function objectUrl(key: string): string {
		const encoded = encodeKey(key);
		if (config.forcePathStyle) {
			return `${config.endpoint}/${encodeURIComponent(config.bucket)}/${encoded}`;
		}
		// virtual-hosted style: bucket as subdomain
		return `${endpoint.protocol}//${encodeURIComponent(config.bucket)}.${endpoint.host}/${encoded}`;
	}

	return {
		provider: 's3',

		async put({ key, body, contentType }: PutInput) {
			// Copy into a fresh ArrayBuffer so the resulting Blob/BodyInit types
			// resolve cleanly across Node/DOM lib variations.
			const ab = new ArrayBuffer(body.byteLength);
			new Uint8Array(ab).set(body);
			const blob = new Blob([ab], { type: contentType });
			const res = await aws.fetch(objectUrl(key), {
				method: 'PUT',
				body: blob,
				headers: {
					'Content-Type': contentType,
					'Content-Length': String(blob.size)
				}
			});
			if (!res.ok) {
				const text = await res.text().catch(() => '');
				console.error(`[s3] PUT key=${key} status=${res.status} body=${text.slice(0, 500)}`);
				throw new Error(`S3 PUT failed (${res.status})`);
			}
			return { key };
		},

		async get(key: string): Promise<GetResult | null> {
			// Issue a presigned GET URL. Caller redirects browser to it.
			// We do not HEAD first — if the object is missing the eventual fetch
			// will 404, which is acceptable for a homelab.
			const url = `${objectUrl(key)}?X-Amz-Expires=${config.presignTtlSeconds}`;
			const signed = await aws.sign(new Request(url, { method: 'GET' }), {
				aws: { signQuery: true }
			});
			return {
				kind: 'redirect',
				url: signed.url,
				cacheSeconds: Math.min(60, Math.max(0, config.presignTtlSeconds - 30))
			};
		},

		async delete(key: string): Promise<void> {
			const res = await aws.fetch(objectUrl(key), { method: 'DELETE' });
			if (!res.ok && res.status !== 404) {
				const text = await res.text().catch(() => '');
				console.error(`[s3] DELETE key=${key} status=${res.status} body=${text.slice(0, 500)}`);
				throw new Error(`S3 DELETE failed (${res.status})`);
			}
		}
	};
}
