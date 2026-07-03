import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { db, schema } from '$lib/server/db';
import { and, eq, ne } from 'drizzle-orm';
import { listQuickLogs } from '$lib/server/quick-logs';
import { listAllowedCompanions } from '$lib/server/companion-scope';

export { quickLogActions as actions } from '$lib/server/quick-log-actions';

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
