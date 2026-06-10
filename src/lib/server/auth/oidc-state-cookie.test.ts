import { describe, it, expect } from 'vitest';
import type { Cookies } from '@sveltejs/kit';
import {
	setOidcStateCookie,
	readAndClearOidcStateCookie,
	type OidcStatePayload
} from './oidc-state';

function fakeCookies() {
	const jar = new Map<string, string>();
	const cookies = {
		get: (name: string) => jar.get(name),
		set: (name: string, value: string, _opts: unknown) => {
			jar.set(name, value);
		}
	} as unknown as Cookies;
	return { cookies, jar };
}

const payload: OidcStatePayload = {
	state: 'state-123',
	nonce: 'nonce-456',
	codeVerifier: 'verifier-789',
	returnTo: '/care',
	createdAt: 1750000000000
};

describe('oidc state cookie', () => {
	it('round-trips a payload', async () => {
		const { cookies } = fakeCookies();
		await setOidcStateCookie(cookies, payload, false);
		const read = await readAndClearOidcStateCookie(cookies, false);
		expect(read).toEqual(payload);
	});

	it('clears the cookie on read (single use)', async () => {
		const { cookies, jar } = fakeCookies();
		await setOidcStateCookie(cookies, payload, false);
		await readAndClearOidcStateCookie(cookies, false);
		expect(jar.get('einvault_oidc_state')).toBe('');
		expect(await readAndClearOidcStateCookie(cookies, false)).toBeNull();
	});

	it('rejects a tampered payload', async () => {
		const { cookies, jar } = fakeCookies();
		await setOidcStateCookie(cookies, payload, false);
		const raw = jar.get('einvault_oidc_state')!;
		const [encoded, sig] = [
			raw.slice(0, raw.lastIndexOf('.')),
			raw.slice(raw.lastIndexOf('.') + 1)
		];
		const tampered = encoded.slice(0, -2) + 'xx' + '.' + sig;
		jar.set('einvault_oidc_state', tampered);
		expect(await readAndClearOidcStateCookie(cookies, false)).toBeNull();
	});

	it('rejects a missing or malformed cookie', async () => {
		const { cookies, jar } = fakeCookies();
		expect(await readAndClearOidcStateCookie(cookies, false)).toBeNull();
		jar.set('einvault_oidc_state', 'no-dot-separator');
		expect(await readAndClearOidcStateCookie(cookies, false)).toBeNull();
	});

	it('rejects a signed payload whose returnTo is invalid', async () => {
		const { cookies } = fakeCookies();
		await setOidcStateCookie(cookies, { ...payload, returnTo: 'https://evil.example.com' }, false);
		expect(await readAndClearOidcStateCookie(cookies, false)).toBeNull();
	});
});
