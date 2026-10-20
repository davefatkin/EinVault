import { describe, it, expect } from 'vitest';
import { isValidReturnTo, idpRedirectTarget } from './oidc-state';

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

describe('idpRedirectTarget', () => {
	it('opts the endpoint origin into an external redirect', () => {
		expect(idpRedirectTarget('https://idp.example.com/authorize?state=x')).toEqual({
			location: 'https://idp.example.com/authorize?state=x',
			options: { external: ['https://idp.example.com'] }
		});
	});

	it('accepts plain http for LAN and mock IdPs', () => {
		expect(idpRedirectTarget('http://127.0.0.1:9000/auth')?.options).toEqual({
			external: ['http://127.0.0.1:9000']
		});
	});

	it.each([
		'javascript:alert(1)',
		'data:text/html,hi',
		'ftp://idp.example.com/authorize',
		'/auth/login',
		'not a url'
	])('rejects %s', (href) => {
		expect(idpRedirectTarget(href)).toBeNull();
	});
});
