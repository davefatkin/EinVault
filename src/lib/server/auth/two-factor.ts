import type { Cookies } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';
import type { Require2fa } from '$lib/server/app-settings';

export function requiresTwoFactor(
	user: { role: 'admin' | 'member' | 'caretaker'; isOidc: boolean; totpEnabled: boolean },
	require2fa: Require2fa
): boolean {
	if (require2fa === 'off') return false;
	if (user.isOidc) return false;
	if (user.totpEnabled) return false;
	if (require2fa === 'admins') return user.role === 'admin';
	return true; // 'everyone'
}

// --- Pending-MFA signed cookie (HMAC, mirrors oidc-state.ts) ---

const COOKIE_NAME = 'einvault_mfa_pending';
const TTL_MS = 5 * 60 * 1000;

function b64url(bytes: Uint8Array): string {
	return btoa(String.fromCharCode(...bytes))
		.replace(/\+/g, '-')
		.replace(/\//g, '_')
		.replace(/=+$/, '');
}
function b64urlDecode(s: string): Uint8Array {
	const bin = atob(s.replace(/-/g, '+').replace(/_/g, '/'));
	return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}

let _key: Promise<CryptoKey> | null = null;
function getKey(): Promise<CryptoKey> {
	if (_key) return _key;
	_key = (async () => {
		const secret = env.OIDC_STATE_SECRET; // reuse the existing app HMAC secret
		if (!secret && process.env.NODE_ENV === 'production') {
			throw new Error('[2fa] OIDC_STATE_SECRET is required in production for the MFA cookie.');
		}
		const material = secret
			? await crypto.subtle.digest('SHA-256', new TextEncoder().encode(secret))
			: crypto.getRandomValues(new Uint8Array(32));
		return crypto.subtle.importKey('raw', material, { name: 'HMAC', hash: 'SHA-256' }, false, [
			'sign',
			'verify'
		]);
	})();
	return _key;
}

export async function setPendingMfaCookie(
	cookies: Cookies,
	userId: string,
	secure: boolean
): Promise<void> {
	const payload = b64url(
		new TextEncoder().encode(JSON.stringify({ userId, exp: Date.now() + TTL_MS }))
	);
	const sigBuf = await crypto.subtle.sign(
		'HMAC',
		await getKey(),
		new TextEncoder().encode(payload)
	);
	cookies.set(COOKIE_NAME, `${payload}.${b64url(new Uint8Array(sigBuf))}`, {
		path: '/auth/2fa',
		httpOnly: true,
		sameSite: 'strict',
		secure,
		maxAge: TTL_MS / 1000
	});
}

export function clearPendingMfaCookie(cookies: Cookies, secure: boolean): void {
	cookies.set(COOKIE_NAME, '', {
		path: '/auth/2fa',
		httpOnly: true,
		sameSite: 'strict',
		secure,
		maxAge: 0
	});
}

export async function readPendingMfaCookie(cookies: Cookies): Promise<{ userId: string } | null> {
	const raw = cookies.get(COOKIE_NAME);
	if (!raw) return null;
	const dot = raw.lastIndexOf('.');
	if (dot === -1) return null;
	const payload = raw.slice(0, dot);
	const sig = raw.slice(dot + 1);
	const sigBytes = b64urlDecode(sig);
	const ok = await crypto.subtle.verify(
		'HMAC',
		await getKey(),
		sigBytes.buffer as ArrayBuffer,
		new TextEncoder().encode(payload)
	);
	if (!ok) return null;
	try {
		const { userId, exp } = JSON.parse(new TextDecoder().decode(b64urlDecode(payload)));
		if (typeof userId !== 'string' || typeof exp !== 'number' || Date.now() > exp) return null;
		return { userId };
	} catch {
		return null;
	}
}
