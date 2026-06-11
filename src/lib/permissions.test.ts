import { describe, it, expect } from 'vitest';
import { canModifyMedia } from './permissions';

const admin = { id: 'a1', role: 'admin' } as const;
const member = { id: 'm1', role: 'member' } as const;

describe('canModifyMedia', () => {
	it('rejects missing user', () => {
		expect(canModifyMedia(null, { loggedBy: 'm1' })).toBe(false);
		expect(canModifyMedia(undefined, { loggedBy: 'm1' })).toBe(false);
	});

	it('admin can modify any media item, including legacy null-loggedBy rows', () => {
		expect(canModifyMedia(admin, { loggedBy: 'someone-else' })).toBe(true);
		expect(canModifyMedia(admin, { loggedBy: null })).toBe(true);
	});

	it('non-admin can modify only own media items', () => {
		expect(canModifyMedia(member, { loggedBy: 'm1' })).toBe(true);
		expect(canModifyMedia(member, { loggedBy: 'other' })).toBe(false);
		expect(canModifyMedia(member, { loggedBy: null })).toBe(false);
	});
});
