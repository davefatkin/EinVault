import { SEED } from '$server/db/demo-seed';

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
