import type { UserRole } from '$lib/server/validation';

// Role enforcement for writes to the owner UI. The (app) and (admin) layouts
// check roles in load(), but SvelteKit runs a form action before any load, so
// those checks never protect a POST. This decision runs in hooks.server.ts for
// every request instead, keyed on the route group, so a new action under (app)
// is covered without remembering a per-action check.
//
// Reads (GET/HEAD) are left to the layouts, which redirect rather than error.
// Routes outside (app) (care, api, auth, setup) enforce their own rules.

export type RouteGuardDecision = 'allow' | 'unauthenticated' | 'forbidden';

const OWNER_GROUP = '/(app)';
const ADMIN_GROUP = '/(app)/(admin)';

function inGroup(routeId: string, group: string): boolean {
	return routeId === group || routeId.startsWith(group + '/');
}

export function ownerRouteDecision(
	method: string,
	routeId: string | null,
	user: { role: UserRole } | null
): RouteGuardDecision {
	if (method === 'GET' || method === 'HEAD') return 'allow';
	if (!routeId || !inGroup(routeId, OWNER_GROUP)) return 'allow';
	if (!user) return 'unauthenticated';
	if (user.role === 'caretaker') return 'forbidden';
	if (inGroup(routeId, ADMIN_GROUP) && user.role !== 'admin') return 'forbidden';
	return 'allow';
}
