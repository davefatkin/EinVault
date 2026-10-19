import { error, json } from '@sveltejs/kit';
import { and, inArray, isNull } from 'drizzle-orm';
import { t } from '#lib/i18n/index.js';
import { db, schema } from '#lib/server/db/index.js';
import { apiRoute } from '#lib/server/auth/api-request.js';
import { throwCareError } from '#lib/server/care-errors.js';
import { listAllowedCompanions } from '#lib/server/companion-scope.js';
import { requireFullScope } from '#lib/server/api-guards.js';
import { toApiReminder } from '#lib/server/api-serializers.js';
import { parsePagination, paginate } from '#lib/server/pagination.js';

// GET /api/reminders?companionId=&status=due|all. Full-scope only. Without
// companionId, lists across every companion the token user may access.
// status defaults to `due` (not yet completed); `status=all` includes completed.
export const GET = apiRoute(async ({ event, user, scope, locale }) => {
	requireFullScope(scope, locale);

	const allowed = await listAllowedCompanions({ id: user.id, role: user.role });
	const companionId = event.url.searchParams.get('companionId');
	let ids = allowed;
	if (companionId) {
		if (!allowed.includes(companionId)) throwCareError('notAssigned', locale);
		ids = [companionId];
	}
	// Validate request params before the empty-scope short-circuit so a bad
	// status/limit is still a 400, not a silent empty 200.
	const statusParam = event.url.searchParams.get('status');
	if (statusParam !== null && statusParam !== 'due' && statusParam !== 'all')
		error(400, { code: 'invalidStatus', message: t(locale, 'error.invalidStatus') });
	const includeCompleted = statusParam === 'all';
	// Runs parsePagination once here purely to validate before the empty-scope
	// short-circuit below (a bad limit/offset must still be a 400, not a silent
	// empty 200); paginate() below re-parses it for the actual fetch.
	parsePagination(event.url, locale);

	if (ids.length === 0) return json({ reminders: [], hasMore: false });

	const filters = [inArray(schema.reminders.companionId, ids)];
	if (!includeCompleted) filters.push(isNull(schema.reminders.completedAt));

	const { page, hasMore } = await paginate(event.url, locale, (take, offset) =>
		db.query.reminders.findMany({
			where: and(...filters),
			orderBy: (r, { asc, desc }) => (includeCompleted ? [desc(r.dueAt)] : [asc(r.dueAt)]),
			limit: take,
			offset
		})
	);
	return json({ reminders: page.map(toApiReminder), hasMore });
});
