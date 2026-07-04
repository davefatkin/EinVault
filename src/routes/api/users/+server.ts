import { error, json } from '@sveltejs/kit';
import { eq, ne } from 'drizzle-orm';
import { t } from '$lib/i18n';
import { db, schema } from '$lib/server/db';
import { apiRoute } from '$lib/server/auth/api-request';
import { toApiUser } from '$lib/server/api-serializers';
import { paginate } from '$lib/server/pagination';

// GET /api/users. Full-scope only. Role-scoped visibility: admin sees everyone;
// member sees everyone except admins; caretaker sees only themselves.
export const GET = apiRoute(async ({ event, user, scope, locale }) => {
	if (scope === 'write')
		error(403, { code: 'writeScopeReadOnly', message: t(locale, 'error.forbidden') });

	const where =
		user.role === 'admin'
			? undefined
			: user.role === 'member'
				? ne(schema.users.role, 'admin')
				: eq(schema.users.id, user.id); // caretaker: self only

	const { page, hasMore } = await paginate(event.url, locale, (take, offset) =>
		db.query.users.findMany({
			where,
			orderBy: (u, { asc }) => [asc(u.displayName)],
			limit: take,
			offset
		})
	);
	return json({ users: page.map(toApiUser), hasMore });
});
