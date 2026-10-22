import { eq, ne } from 'drizzle-orm';
import { db, schema } from '#lib/server/db/index.js';
import { apiRoute } from '#lib/server/auth/api-request.js';
import { requireFullScope } from '#lib/server/api-guards.js';
import { toApiUser, toApiUserPublic } from '#lib/server/api-serializers.js';
import { paginate } from '#lib/server/pagination.js';

// GET /api/users. Full-scope only. Role-scoped visibility: admin sees everyone;
// member sees everyone except admins; caretaker sees only themselves. A
// member-role requester gets the reduced toApiUserPublic shape (no
// `username`, the login identifier); admin and caretaker-self keep it.
export const GET = apiRoute(async ({ event, user, scope, locale }) => {
	requireFullScope(scope, locale);

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
	const serialize = user.role === 'member' ? toApiUserPublic : toApiUser;
	return Response.json({ users: page.map(serialize), hasMore });
});
