import { error, json } from '@sveltejs/kit';
import { and, eq, gte, lte, type SQL } from 'drizzle-orm';
import { t } from '$lib/i18n';
import { db, schema } from '$lib/server/db';
import { apiRoute } from '$lib/server/auth/api-request';
import { toApiShift } from '$lib/server/api-serializers';
import { isValidDate } from '$lib/server/validation';

// GET /api/shifts?from=YYYY-MM-DD&to=YYYY-MM-DD. Full-scope only. admin/member
// see all shifts; a caretaker sees only their own.
export const GET = apiRoute(async ({ event, user, scope, locale }) => {
	if (scope === 'write')
		error(403, { code: 'writeScopeReadOnly', message: t(locale, 'error.forbidden') });

	const filters: SQL[] = [];
	if (user.role === 'caretaker') filters.push(eq(schema.caretakerShifts.userId, user.id));

	const fromParam = event.url.searchParams.get('from');
	if (fromParam) {
		if (!isValidDate(fromParam))
			error(400, { code: 'invalidDate', message: t(locale, 'error.invalidDate') });
		filters.push(gte(schema.caretakerShifts.endAt, new Date(`${fromParam}T00:00:00`)));
	}
	const toParam = event.url.searchParams.get('to');
	if (toParam) {
		if (!isValidDate(toParam))
			error(400, { code: 'invalidDate', message: t(locale, 'error.invalidDate') });
		filters.push(lte(schema.caretakerShifts.startAt, new Date(`${toParam}T23:59:59`)));
	}

	const rows = await db.query.caretakerShifts.findMany({
		where: filters.length ? and(...filters) : undefined,
		orderBy: (s, { desc }) => [desc(s.startAt)],
		limit: 200
	});
	return json({ shifts: rows.map(toApiShift) });
});
