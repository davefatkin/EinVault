import { fail, redirect } from '@sveltejs/kit';
import type { PageServerLoad, Actions } from './$types';
import { db, schema } from '$lib/server/db';
import { and, eq, ne } from 'drizzle-orm';
import { listQuickLogs } from '$lib/server/quick-logs';
import {
	handleQuickLogCreate,
	handleQuickLogUpdate,
	handleQuickLogDelete,
	handleQuickLogToggle,
	handleQuickLogMove,
	handleQuickLogShare
} from '$lib/server/quick-log-actions';

export const load: PageServerLoad = async ({ locals }) => {
	if (!locals.user) redirect(302, '/auth/login');

	const [quickLogs, companions, shareableUsers] = await Promise.all([
		listQuickLogs(locals.user.id),
		db.query.companions.findMany({
			where: eq(schema.companions.isActive, true),
			orderBy: (c, { asc }) => [asc(c.name)],
			columns: { id: true, name: true }
		}),
		db.query.users.findMany({
			where: and(eq(schema.users.isActive, true), ne(schema.users.id, locals.user.id)),
			orderBy: (u, { asc }) => [asc(u.displayName)],
			columns: { id: true, displayName: true }
		})
	]);

	return { quickLogs, quickLogCompanions: companions, shareableUsers };
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
