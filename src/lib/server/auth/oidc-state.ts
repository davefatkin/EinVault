import type { Cookies } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';

const COOKIE_NAME = 'einvault_oidc_state';
const COOKIE_PATH = '/auth/oidc';

export interface OidcStatePayload {
	state: string;
	nonce: string;
	codeVerifier: string;
	returnTo: string;
	createdAt: number;
}

function base64urlEncode(buf: ArrayBuffer | Uint8Array): string {
	const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
	return btoa(String.fromCharCode(...bytes))
		.replace(/\+/g, '-')
		.replace(/\//g, '_')
		.replace(/=+$/, '');
}

function base64urlDecode(str: string): Uint8Array {
	const base64 = str.replace(/-/g, '+').replace(/_/g, '/');
	const bin = atob(base64);
	return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}

// Derive or generate a stable HMAC key for this process lifetime.
let _keyPromise: Promise<CryptoKey> | null = null;

function getKey(): Promise<CryptoKey> {
	if (_keyPromise) return _keyPromise;
	_keyPromise = (async () => {
		const secret = env.OIDC_STATE_SECRET;
		if (!secret) {
			if (process.env.NODE_ENV === 'production') {
				throw new Error(
					'[oidc] OIDC_STATE_SECRET is required in production. Refusing to start OIDC login flow with an ephemeral key.'
				);
			}
			console.warn(
				'[oidc] OIDC_STATE_SECRET not set — using ephemeral key. In-flight logins will break on restart.'
			);
			const raw = crypto.getRandomValues(new Uint8Array(32));
			return crypto.subtle.importKey('raw', raw, { name: 'HMAC', hash: 'SHA-256' }, false, [
				'sign',
				'verify'
			]);
		}
		const enc = new TextEncoder().encode(secret);
		const raw = await crypto.subtle.digest('SHA-256', enc);
		return crypto.subtle.importKey('raw', raw, { name: 'HMAC', hash: 'SHA-256' }, false, [
			'sign',
			'verify'
		]);
	})();
	return _keyPromise;
}

async function sign(payload: string): Promise<string> {
	const key = await getKey();
	const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(payload));
	return base64urlEncode(sig);
}

async function verify(payload: string, signature: string): Promise<boolean> {
	const key = await getKey();
	const sig = base64urlDecode(signature);
	const data = new TextEncoder().encode(payload);
	return crypto.subtle.verify('HMAC', key, sig.buffer as ArrayBuffer, data.buffer as ArrayBuffer);
}

export async function setOidcStateCookie(
	cookies: Cookies,
	payload: OidcStatePayload,
	secure: boolean
): Promise<void> {
	const json = JSON.stringify(payload);
	const encoded = base64urlEncode(new TextEncoder().encode(json));
	const sig = await sign(encoded);
	const value = `${encoded}.${sig}`;

	cookies.set(COOKIE_NAME, value, {
		path: COOKIE_PATH,
		httpOnly: true,
		sameSite: 'lax',
		secure,
		maxAge: 600
	});
}

export async function readAndClearOidcStateCookie(
	cookies: Cookies,
	secure: boolean
): Promise<OidcStatePayload | null> {
	const raw = cookies.get(COOKIE_NAME);

	// Always clear it — single use.
	cookies.set(COOKIE_NAME, '', {
		path: COOKIE_PATH,
		httpOnly: true,
		sameSite: 'lax',
		secure,
		maxAge: 0
	});

	if (!raw) return null;

	const dot = raw.lastIndexOf('.');
	if (dot === -1) return null;

	const encoded = raw.slice(0, dot);
	const sig = raw.slice(dot + 1);

	const ok = await verify(encoded, sig);
	if (!ok) return null;

	try {
		const json = new TextDecoder().decode(base64urlDecode(encoded));
		const payload = JSON.parse(json) as OidcStatePayload;

		if (!isValidReturnTo(payload.returnTo)) return null;

		return payload;
	} catch {
		return null;
	}
}

export function isValidReturnTo(returnTo: string): boolean {
	if (!returnTo.startsWith('/')) return false;
	// Block protocol-relative and backslash-authority confusions some browsers normalize.
	if (returnTo.startsWith('//') || returnTo.startsWith('/\\')) return false;
	// Reject control chars and whitespace that could break URL parsing.
	// eslint-disable-next-line no-control-regex
	if (/[\s\x00-\x1f]/.test(returnTo)) return false;
	return true;
}
