import { inArray } from 'drizzle-orm';
import { db, schema } from '#lib/server/db/index.js';
import { apiRoute } from '#lib/server/auth/api-request.js';
import { listAllowedCompanions } from '#lib/server/companion-scope.js';
import { sharedNotesMarkdown } from '#lib/server/notes.js';
import { toApiCompanion, toApiCompanionMinimal } from '#lib/server/api-serializers.js';

// Bearer-token endpoint: list the companions the token user may target, so a
// device can discover ids for /api/logs and /api/journal. Scope matches the
// write boundary (members/admins: all active; caretakers: assigned active),
// but is shift-independent: listing ids off-shift grants no write capability.
// `write`-scoped tokens get a minimal projection without companion PII.
export const GET = apiRoute(async ({ user, scope }) => {
	const ids = await listAllowedCompanions({ id: user.id, role: user.role });
	if (ids.length === 0) return Response.json({ companions: [] });

	const rows = await db.query.companions.findMany({
		where: inArray(schema.companions.id, ids),
		orderBy: (c, { asc }) => [asc(c.name)]
	});

	if (scope === 'write') return Response.json({ companions: rows.map(toApiCompanionMinimal) });
	const sitterNotes = await sharedNotesMarkdown(rows.map((r) => r.id));
	return Response.json({
		companions: rows.map((r) => toApiCompanion(r, sitterNotes.get(r.id) ?? null))
	});
});
