import { describe, it, expect, afterEach, vi } from 'vitest';

// $env/dynamic/private snapshots process.env at module import, which is before
// any test body runs. Replace it with a live proxy so per-test env mutation works.
vi.mock('$env/dynamic/private', () => ({
	env: new Proxy({} as Record<string, string | undefined>, {
		get: (_, key: string) => process.env[key]
	})
}));

const { evaluateRole, isAdminGroupsConfigured } = await import('./oidc');

type Claims = Parameters<typeof evaluateRole>[0];

function claims(groups?: unknown): Claims {
	return { sub: 'sub-1', ...(groups !== undefined ? { groups } : {}) } as unknown as Claims;
}

afterEach(() => {
	delete process.env.OIDC_ADMIN_GROUPS;
});

describe('isAdminGroupsConfigured', () => {
	it('is false when unset', () => {
		expect(isAdminGroupsConfigured()).toBe(false);
	});

	it('is false for empty or comma-only values', () => {
		process.env.OIDC_ADMIN_GROUPS = ' , ,';
		expect(isAdminGroupsConfigured()).toBe(false);
	});

	it('is true when at least one group is configured', () => {
		process.env.OIDC_ADMIN_GROUPS = 'admins';
		expect(isAdminGroupsConfigured()).toBe(true);
	});
});

describe('evaluateRole', () => {
	it('grants admin when a claim group matches a configured group', () => {
		process.env.OIDC_ADMIN_GROUPS = 'admins, ops';
		expect(evaluateRole(claims(['users', 'ops']), 'member')).toBe('admin');
	});

	it('accepts a single string groups claim', () => {
		process.env.OIDC_ADMIN_GROUPS = 'admins';
		expect(evaluateRole(claims('admins'), 'member')).toBe('admin');
	});

	it('demotes an existing admin when no configured group matches', () => {
		process.env.OIDC_ADMIN_GROUPS = 'admins';
		expect(evaluateRole(claims(['users']), 'admin')).toBe('member');
	});

	it('demotes an existing admin when the groups claim is missing', () => {
		process.env.OIDC_ADMIN_GROUPS = 'admins';
		expect(evaluateRole(claims(), 'admin')).toBe('member');
	});

	it('preserves caretaker regardless of groups', () => {
		process.env.OIDC_ADMIN_GROUPS = 'admins';
		expect(evaluateRole(claims(['users']), 'caretaker')).toBe('caretaker');
	});

	it('never grants admin from the fallback role alone', () => {
		expect(evaluateRole(claims(['admins']), 'admin')).toBe('member');
	});

	it('ignores a non-array, non-string groups claim', () => {
		process.env.OIDC_ADMIN_GROUPS = 'admins';
		expect(evaluateRole(claims({ nested: 'admins' }), 'member')).toBe('member');
	});
});
