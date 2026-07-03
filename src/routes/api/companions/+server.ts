import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { inArray } from 'drizzle-orm';
import { db, schema } from '$lib/server/db';
import { requireApiToken } from '$lib/server/auth/api-request';
import { allowedCompanionIds } from '$lib/server/quick-logs';
import { toApiCompanion } from '$lib/server/api-serializers';

// Bearer-token endpoint: list the companions the token user may target, so a
// device can discover ids for /api/logs and /api/journal. Scope matches the
// write boundary (members/admins: all active; caretakers: assigned active),
// but is shift-independent: listing ids off-shift grants no write capability.
export const GET: RequestHandler = async (event) => {
	const { user } = await requireApiToken(event);

	const ids = await allowedCompanionIds({ id: user.id, role: user.role });
	if (ids.length === 0) return json({ companions: [] });

	const rows = await db.query.companions.findMany({
		where: inArray(schema.companions.id, ids),
		orderBy: (c, { asc }) => [asc(c.name)]
	});

	return json({ companions: rows.map(toApiCompanion) });
};
