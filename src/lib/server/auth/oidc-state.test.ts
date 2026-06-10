import { describe, it, expect } from 'vitest';
import { isValidReturnTo } from './oidc-state';

describe('isValidReturnTo', () => {
	it('accepts app-relative paths', () => {
		expect(isValidReturnTo('/')).toBe(true);
		expect(isValidReturnTo('/care')).toBe(true);
		expect(isValidReturnTo('/settings?tab=profile')).toBe(true);
	});

	it('rejects absolute and scheme URLs', () => {
		expect(isValidReturnTo('https://evil.example.com/')).toBe(false);
		expect(isValidReturnTo('javascript:alert(1)')).toBe(false);
		expect(isValidReturnTo('')).toBe(false);
	});

	it('rejects protocol-relative URLs', () => {
		expect(isValidReturnTo('//evil.example.com/')).toBe(false);
	});

	it('rejects backslash authority confusion', () => {
		expect(isValidReturnTo('/\\evil.example.com')).toBe(false);
	});

	it('rejects control characters and whitespace', () => {
		expect(isValidReturnTo('/care\nSet-Cookie: x=y')).toBe(false);
		expect(isValidReturnTo('/care\x00')).toBe(false);
		expect(isValidReturnTo('/care path')).toBe(false);
	});
});
