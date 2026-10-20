import { SEED } from '#lib/server/db/demo-seed.js';
import { isValidReturnTo } from '#lib/server/auth/oidc-state.js';

export const DEMO_ROLES = ['admin', 'member', 'caretaker'] as const;
export type DemoRole = (typeof DEMO_ROLES)[number];

const ROLE_TO_USER_ID: Record<DemoRole, string> = {
	admin: SEED.admin.id,
	member: SEED.member.id,
	caretaker: SEED.caretaker.id
};

export function demoUserIdForRole(role: string): string | null {
	return (DEMO_ROLES as readonly string[]).includes(role)
		? ROLE_TO_USER_ID[role as DemoRole]
		: null;
}

const DEMO_WRITE_ALLOWLIST = new Set(['/auth/demo', '/auth/logout']);

export function isDemoBlockedRequest(method: string, pathname: string): boolean {
	const m = method.toUpperCase();
	if (m === 'GET' || m === 'HEAD' || m === 'OPTIONS') return false;
	return !DEMO_WRITE_ALLOWLIST.has(pathname);
}

/**
 * Where a blocked demo write sends the visitor back to: the referring page,
 * but only when it is on this origin and its path cannot be read as
 * protocol-relative (`//host`).
 */
export function demoReturnPath(referer: string | null, selfOrigin: string): string {
	if (!referer || !URL.canParse(referer)) return '/';
	const url = new URL(referer);
	if (url.origin !== selfOrigin) return '/';
	const back = url.pathname + url.search;
	return isValidReturnTo(back) ? back : '/';
}
