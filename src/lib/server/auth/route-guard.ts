import type { UserRole } from '$lib/server/validation';

// Role enforcement for writes to the owner and caretaker UIs. The (app),
// (admin) and (caretaker) layouts check roles in load(), but SvelteKit runs a
// form action before any load, so those checks never protect a POST. This
// decision runs in hooks.server.ts for every request instead, keyed on the
// route group, so a new action under a guarded group is covered without
// remembering a per-action check.
//
// Reads (GET/HEAD) are left to the layouts, which redirect or error on their own.
// Routes outside these groups (api, auth, setup, 2fa-setup) enforce their own
// rules.

export type RouteGuardDecision = 'allow' | 'unauthenticated' | 'forbidden';

const OWNER_GROUP = '/(app)';
const ADMIN_GROUP = '/(app)/(admin)';
const CARETAKER_GROUP = '/(caretaker)';

function inGroup(routeId: string, group: string): boolean {
	return routeId === group || routeId.startsWith(group + '/');
}

export function routeGroupDecision(
	method: string,
	routeId: string | null,
	user: { role: UserRole } | null
): RouteGuardDecision {
	if (method === 'GET' || method === 'HEAD') return 'allow';
	if (!routeId) return 'allow';
	if (inGroup(routeId, OWNER_GROUP)) {
		if (!user) return 'unauthenticated';
		if (user.role === 'caretaker') return 'forbidden';
		if (inGroup(routeId, ADMIN_GROUP) && user.role !== 'admin') return 'forbidden';
		return 'allow';
	}
	if (inGroup(routeId, CARETAKER_GROUP)) {
		if (!user) return 'unauthenticated';
		if (user.role !== 'caretaker') return 'forbidden';
		return 'allow';
	}
	return 'allow';
}
