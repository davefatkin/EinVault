import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest';
import { isHttpError } from '@sveltejs/kit';
import { db, schema } from '#lib/server/db/index.js';
import type { StorageBackend } from '#lib/server/storage/index.js';

// Storage is not under test: any read that gets past the access checks
// answers 304, so "served" is easy to tell apart from 403 and 404.
const backend = vi.hoisted(() => ({
	get: vi.fn(async () => ({ kind: 'notModified', etag: '"e1"' })),
	provider: 'local'
}));
vi.mock('#lib/server/storage/index.js', () => ({
	getStorage: () => backend as unknown as StorageBackend
}));

const { GET } = await import('./+server');

// #348: caretakers read avatars only for companions they're assigned to that
// are active, like note media. Members and admins read any avatar.
describe('GET /api/avatars/[companionId]', () => {
	const CARETAKER = 'av-caretaker';
	const MEMBER = 'av-member';
	const ADMIN = 'av-admin';
	const ASSIGNED = 'av-assigned';
	const ARCHIVED = 'av-archived';
	const UNASSIGNED = 'av-unassigned';
	const UNASSIGNED_NO_AVATAR = 'av-unassigned-bare';

	beforeAll(async () => {
		await db.insert(schema.users).values([
			{ id: CARETAKER, username: CARETAKER, displayName: 'Faye', role: 'caretaker' },
			{ id: MEMBER, username: MEMBER, displayName: 'Jet', role: 'member' },
			{ id: ADMIN, username: ADMIN, displayName: 'Spike', role: 'admin' }
		] as (typeof schema.users.$inferInsert)[]);
		const avatar = { avatarPath: 'x.jpg', avatarProvider: 'local' as const };
		await db.insert(schema.companions).values([
			{ id: ASSIGNED, name: 'Ein', ...avatar },
			{ id: ARCHIVED, name: 'Old', isActive: false, ...avatar },
			{ id: UNASSIGNED, name: 'Edward', ...avatar },
			{ id: UNASSIGNED_NO_AVATAR, name: 'Bare' }
		] as (typeof schema.companions.$inferInsert)[]);
		await db.insert(schema.companionCaretakers).values([
			{ companionId: ASSIGNED, userId: CARETAKER },
			{ companionId: ARCHIVED, userId: CARETAKER }
		] as (typeof schema.companionCaretakers.$inferInsert)[]);
	});

	beforeEach(() => {
		backend.get.mockClear();
	});

	async function status(companionId: string, user: { id: string; role: string }) {
		const url = new URL(`http://x/api/avatars/${companionId}`);
		try {
			const res = await GET({
				params: { companionId },
				locals: { user, locale: 'en' },
				request: new Request(url),
				url
			} as unknown as Parameters<typeof GET>[0]);
			return res.status;
		} catch (e) {
			if (isHttpError(e)) return e.status;
			throw e;
		}
	}

	const caretaker = { id: CARETAKER, role: 'caretaker' };
	const member = { id: MEMBER, role: 'member' };
	const admin = { id: ADMIN, role: 'admin' };

	it('serves an assigned, active companion to its caretaker', async () => {
		expect(await status(ASSIGNED, caretaker)).toBe(304);
	});

	it('refuses a companion the caretaker is not assigned to', async () => {
		expect(await status(UNASSIGNED, caretaker)).toBe(403);
		expect(backend.get).not.toHaveBeenCalled();
	});

	it('refuses before revealing whether an avatar or companion exists', async () => {
		expect(await status(UNASSIGNED_NO_AVATAR, caretaker)).toBe(403);
		expect(await status('av-no-such-companion', caretaker)).toBe(403);
		expect(backend.get).not.toHaveBeenCalled();
	});

	it('hides an archived companion from its caretaker', async () => {
		expect(await status(ARCHIVED, caretaker)).toBe(404);
		expect(backend.get).not.toHaveBeenCalled();
	});

	it('serves any companion to members and admins, archived included', async () => {
		for (const user of [member, admin]) {
			expect(await status(UNASSIGNED, user)).toBe(304);
			expect(await status(ARCHIVED, user)).toBe(304);
			expect(await status(UNASSIGNED_NO_AVATAR, user)).toBe(404);
			expect(await status('av-no-such-companion', user)).toBe(404);
		}
	});
});
