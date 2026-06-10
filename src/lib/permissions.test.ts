import { describe, it, expect } from 'vitest';
import { canModifyPhoto } from './permissions';

const admin = { id: 'a1', role: 'admin' } as const;
const member = { id: 'm1', role: 'member' } as const;

describe('canModifyPhoto', () => {
	it('rejects missing user', () => {
		expect(canModifyPhoto(null, { loggedBy: 'm1' })).toBe(false);
		expect(canModifyPhoto(undefined, { loggedBy: 'm1' })).toBe(false);
	});

	it('admin can modify any photo, including legacy null-loggedBy rows', () => {
		expect(canModifyPhoto(admin, { loggedBy: 'someone-else' })).toBe(true);
		expect(canModifyPhoto(admin, { loggedBy: null })).toBe(true);
	});

	it('non-admin can modify only own photos', () => {
		expect(canModifyPhoto(member, { loggedBy: 'm1' })).toBe(true);
		expect(canModifyPhoto(member, { loggedBy: 'other' })).toBe(false);
		expect(canModifyPhoto(member, { loggedBy: null })).toBe(false);
	});
});
