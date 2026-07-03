import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { db, schema } from '$lib/server/db';
import { and, eq, ne } from 'drizzle-orm';
import { listQuickLogs } from '$lib/server/quick-logs';

export { quickLogActions as actions } from '$lib/server/quick-log-actions';

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
