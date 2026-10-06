import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const fake = vi.hoisted(() => {
	const deleted: string[] = [];
	const failKeys = new Set<string>();
	const backend = (name: string) => ({
		provider: name,
		put: vi.fn(),
		get: vi.fn(),
		delete: vi.fn(async (key: string) => {
			if (failKeys.has(key)) throw new Error(`boom ${key}`);
			deleted.push(`${name}:${key}`);
		})
	});
	const backends: Record<string, ReturnType<typeof backend>> = {
		local: backend('local'),
		s3: backend('s3')
	};
	return { deleted, failKeys, backends };
});

vi.mock('$lib/server/storage', () => ({
	getStorage: vi.fn((provider: string) => {
		const b = fake.backends[provider];
		if (!b) throw new Error(`Storage provider '${provider}' is not configured.`);
		return b;
	})
}));

const { deleteMediaBlobs } = await import('./media-blobs');
const { getStorage } = await import('$lib/server/storage');

let warn: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
	fake.deleted.length = 0;
	fake.failKeys.clear();
	vi.mocked(getStorage).mockClear();
	warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
});
afterEach(() => warn.mockRestore());

describe('deleteMediaBlobs', () => {
	it('deletes every key of every row through the row provider', async () => {
		await deleteMediaBlobs(
			[
				{
					provider: 'local',
					storageKey: 'notes/c/n/a.mp4',
					originalKey: 'notes/c/n/a.orig.mov',
					posterKey: 'notes/c/n/a.poster.jpg'
				},
				{ provider: 's3', storageKey: 'notes/c/n/b.jpg', originalKey: null, posterKey: null }
			],
			'test'
		);
		expect(fake.deleted.sort()).toEqual([
			'local:notes/c/n/a.mp4',
			'local:notes/c/n/a.orig.mov',
			'local:notes/c/n/a.poster.jpg',
			's3:notes/c/n/b.jpg'
		]);
	});

	it('skips immich rows without touching a backend', async () => {
		await deleteMediaBlobs(
			[{ provider: 'immich', storageKey: 'immich:0000', originalKey: null, posterKey: null }],
			'test'
		);
		expect(getStorage).not.toHaveBeenCalled();
		expect(fake.deleted).toEqual([]);
	});

	it('keeps going when one delete fails, and logs it', async () => {
		fake.failKeys.add('notes/c/n/a.jpg');
		await deleteMediaBlobs(
			[
				{ provider: 'local', storageKey: 'notes/c/n/a.jpg', originalKey: null, posterKey: null },
				{ provider: 'local', storageKey: 'notes/c/n/b.jpg', originalKey: null, posterKey: null }
			],
			'test'
		);
		expect(fake.deleted).toEqual(['local:notes/c/n/b.jpg']);
		expect(warn).toHaveBeenCalledWith(
			'[test] failed to delete object notes/c/n/a.jpg:',
			expect.any(Error)
		);
	});

	it('logs and skips a row whose provider is not configured', async () => {
		await expect(
			deleteMediaBlobs(
				[{ provider: 'local', storageKey: 'x', originalKey: null, posterKey: null }].map((r) => ({
					...r,
					provider: 'paperless' as unknown as 'local'
				})),
				'test'
			)
		).resolves.toBeUndefined();
		expect(warn).toHaveBeenCalled();
	});
});
