import { error, json } from '@sveltejs/kit';
import { and, inArray, isNull } from 'drizzle-orm';
import { t } from '$lib/i18n';
import { db, schema } from '$lib/server/db';
import { apiRoute } from '$lib/server/auth/api-request';
import { throwCareError } from '$lib/server/care-errors';
import { listAllowedCompanions } from '$lib/server/companion-scope';
import { toApiReminder } from '$lib/server/api-serializers';

// GET /api/reminders?companionId=&status=due|all. Full-scope only. Without
// companionId, lists across every companion the token user may access.
// status defaults to `due` (not yet completed); `status=all` includes completed.
export const GET = apiRoute(async ({ event, user, scope, locale }) => {
	if (scope === 'write')
		error(403, { code: 'writeScopeReadOnly', message: t(locale, 'error.forbidden') });

	const allowed = await listAllowedCompanions({ id: user.id, role: user.role });
	const companionId = event.url.searchParams.get('companionId');
	let ids = allowed;
	if (companionId) {
		if (!allowed.includes(companionId)) throwCareError('notAssigned', locale);
		ids = [companionId];
	}
	if (ids.length === 0) return json({ reminders: [] });

	const statusParam = event.url.searchParams.get('status');
	if (statusParam !== null && statusParam !== 'due' && statusParam !== 'all')
		error(400, { code: 'invalidStatus', message: t(locale, 'error.invalidStatus') });
	const includeCompleted = statusParam === 'all';
	const filters = [inArray(schema.reminders.companionId, ids)];
	if (!includeCompleted) filters.push(isNull(schema.reminders.completedAt));

	const rows = await db.query.reminders.findMany({
		where: and(...filters),
		orderBy: (r, { asc, desc }) => (includeCompleted ? [desc(r.dueAt)] : [asc(r.dueAt)]),
		limit: 200
	});
	return json({ reminders: rows.map(toApiReminder) });
});
