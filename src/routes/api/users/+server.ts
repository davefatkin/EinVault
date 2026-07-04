import { json } from '@sveltejs/kit';
import { eq, ne } from 'drizzle-orm';
import { db, schema } from '$lib/server/db';
import { apiRoute } from '$lib/server/auth/api-request';
import { requireFullScope } from '$lib/server/api-guards';
import { toApiUser, toApiUserPublic } from '$lib/server/api-serializers';
import { paginate } from '$lib/server/pagination';

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
	return json({ users: page.map(serialize), hasMore });
});
