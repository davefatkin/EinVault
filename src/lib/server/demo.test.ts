import { describe, it, expect } from 'vitest';
import { demoUserIdForRole, isDemoBlockedRequest, DEMO_ROLES } from '$server/demo';
import { SEED } from '$server/db/demo-seed';

describe('demoUserIdForRole', () => {
	it('maps the three roles to their Bebop seed users', () => {
		expect(demoUserIdForRole('admin')).toBe(SEED.admin.id);
		expect(demoUserIdForRole('member')).toBe(SEED.member.id);
		expect(demoUserIdForRole('caretaker')).toBe(SEED.caretaker.id);
	});
	it('rejects unknown roles', () => {
		expect(demoUserIdForRole('superuser')).toBeNull();
		expect(demoUserIdForRole('')).toBeNull();
	});
	it('exposes exactly the three demo roles', () => {
		expect([...DEMO_ROLES]).toEqual(['admin', 'member', 'caretaker']);
	});
});

describe('isDemoBlockedRequest', () => {
	it('allows reads', () => {
		expect(isDemoBlockedRequest('GET', '/')).toBe(false);
		expect(isDemoBlockedRequest('HEAD', '/companions')).toBe(false);
	});
	it('allows only demo login and logout writes', () => {
		expect(isDemoBlockedRequest('POST', '/auth/demo')).toBe(false);
		expect(isDemoBlockedRequest('POST', '/auth/logout')).toBe(false);
	});
	it('blocks every other write, including password login and API writes', () => {
		expect(isDemoBlockedRequest('POST', '/auth/login')).toBe(true);
		expect(isDemoBlockedRequest('POST', '/companions')).toBe(true);
		expect(isDemoBlockedRequest('DELETE', '/api/photos/x')).toBe(true);
		expect(isDemoBlockedRequest('PATCH', '/settings')).toBe(true);
	});
	it('fails closed on near-miss allowlist paths (no fail-open)', () => {
		// Exact-match allowlist: trailing slash / case variants must NOT pass.
		expect(isDemoBlockedRequest('POST', '/auth/demo/')).toBe(true);
		expect(isDemoBlockedRequest('POST', '/AUTH/DEMO')).toBe(true);
		expect(isDemoBlockedRequest('POST', '/auth/demo/../login')).toBe(true);
	});
});
