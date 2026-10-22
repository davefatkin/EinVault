import { error } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';
import { t } from '#lib/i18n/index.js';
import { db, schema } from '#lib/server/db/index.js';
import { apiRoute } from '#lib/server/auth/api-request.js';
import { listAllowedCompanions } from '#lib/server/companion-scope.js';
import { sharedNotesMarkdown } from '#lib/server/notes.js';
import { toApiCompanion, toApiCompanionMinimal } from '#lib/server/api-serializers.js';

// GET /api/companions/{id}: full detail for a companion the token user may
// access. write-scope tokens get the minimal projection (no PII), matching the
// companions list. An id the token can't access reads as 404 (no enumeration).
export const GET = apiRoute(async ({ event, user, scope, locale }) => {
	const companionId = event.params.companionId!;
	const allowed = await listAllowedCompanions({ id: user.id, role: user.role });
	if (!allowed.includes(companionId)) error(404, t(locale, 'error.notFound'), { code: 'notFound' });

	const row = await db.query.companions.findFirst({
		where: eq(schema.companions.id, companionId)
	});
	if (!row) error(404, t(locale, 'error.notFound'), { code: 'notFound' });

	if (scope === 'write') return Response.json({ companion: toApiCompanionMinimal(row) });
	const sitterNotes = await sharedNotesMarkdown([row.id]);
	return Response.json({ companion: toApiCompanion(row, sitterNotes.get(row.id) ?? null) });
});
