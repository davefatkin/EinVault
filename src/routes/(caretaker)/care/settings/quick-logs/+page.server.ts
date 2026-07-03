import { fail, redirect } from '@sveltejs/kit';
import type { PageServerLoad, Actions } from './$types';
import { db, schema } from '$lib/server/db';
import { and, eq, ne } from 'drizzle-orm';
import { listQuickLogs } from '$lib/server/quick-logs';
import { listAllowedCompanions } from '$lib/server/companion-scope';
import {
	handleQuickLogCreate,
	handleQuickLogUpdate,
	handleQuickLogDelete,
	handleQuickLogToggle,
	handleQuickLogMove,
	handleQuickLogShare
} from '$lib/server/quick-log-actions';

// Caretaker twin of /settings/quick-logs: same shared handlers, but the
// companion picker is limited to the caretaker's assigned active companions.
export const load: PageServerLoad = async ({ locals }) => {
	if (!locals.user) redirect(302, '/auth/login');

	const assignedIds = await listAllowedCompanions({ id: locals.user.id, role: locals.user.role });
	const [quickLogs, companions, shareableUsers] = await Promise.all([
		listQuickLogs(locals.user.id),
		assignedIds.length > 0
			? db.query.companions.findMany({
					where: and(eq(schema.companions.isActive, true)),
					orderBy: (c, { asc }) => [asc(c.name)],
					columns: { id: true, name: true }
				})
			: Promise.resolve([]),
		db.query.users.findMany({
			where: and(eq(schema.users.isActive, true), ne(schema.users.id, locals.user.id)),
			orderBy: (u, { asc }) => [asc(u.displayName)],
			columns: { id: true, displayName: true }
		})
	]);

	return {
		quickLogs,
		quickLogCompanions: companions.filter((c) => assignedIds.includes(c.id)),
		shareableUsers
	};
};

export const actions: Actions = {
	create: async ({ request, locals }) => {
		if (!locals.user) return fail(401);
		return handleQuickLogCreate(locals.user, request, locals.locale);
	},
	update: async ({ request, locals }) => {
		if (!locals.user) return fail(401);
		return handleQuickLogUpdate(locals.user, request, locals.locale);
	},
	delete: async ({ request, locals }) => {
		if (!locals.user) return fail(401);
		return handleQuickLogDelete(locals.user, request, locals.locale);
	},
	toggle: async ({ request, locals }) => {
		if (!locals.user) return fail(401);
		return handleQuickLogToggle(locals.user, request, locals.locale);
	},
	move: async ({ request, locals }) => {
		if (!locals.user) return fail(401);
		return handleQuickLogMove(locals.user, request, locals.locale);
	},
	share: async ({ request, locals }) => {
		if (!locals.user) return fail(401);
		return handleQuickLogShare(locals.user, request, locals.locale);
	}
};
