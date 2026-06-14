import { describe, it, expect } from 'vitest';
import { requiresTwoFactor } from './two-factor';

const base = { role: 'member' as const, isOidc: false, totpEnabled: false };

describe('requiresTwoFactor', () => {
	it('off requires nobody', () => {
		expect(requiresTwoFactor(base, 'off')).toBe(false);
	});
	it('admins requires admins only', () => {
		expect(requiresTwoFactor({ ...base, role: 'admin' }, 'admins')).toBe(true);
		expect(requiresTwoFactor({ ...base, role: 'member' }, 'admins')).toBe(false);
	});
	it('everyone requires all password users', () => {
		expect(requiresTwoFactor({ ...base, role: 'caretaker' }, 'everyone')).toBe(true);
	});
	it('exempts oidc users', () => {
		expect(requiresTwoFactor({ ...base, role: 'admin', isOidc: true }, 'everyone')).toBe(false);
	});
	it('returns false once enrolled', () => {
		expect(requiresTwoFactor({ ...base, totpEnabled: true }, 'everyone')).toBe(false);
	});
});
