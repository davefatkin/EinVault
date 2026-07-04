import { error, json } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';
import { t } from '$lib/i18n';
import { db, schema } from '$lib/server/db';
import { apiRoute } from '$lib/server/auth/api-request';
import { listAllowedCompanions } from '$lib/server/companion-scope';
import { toApiCompanion, toApiCompanionMinimal } from '$lib/server/api-serializers';

// GET /api/companions/{id}: full detail for a companion the token user may
// access. write-scope tokens get the minimal projection (no PII), matching the
// companions list. An id the token can't access reads as 404 (no enumeration).
export const GET = apiRoute(async ({ event, user, scope, locale }) => {
	const companionId = event.params.companionId!;
	const allowed = await listAllowedCompanions({ id: user.id, role: user.role });
	if (!allowed.includes(companionId))
		error(404, { code: 'notFound', message: t(locale, 'error.notFound') });

	const row = await db.query.companions.findFirst({
		where: eq(schema.companions.id, companionId)
	});
	if (!row) error(404, { code: 'notFound', message: t(locale, 'error.notFound') });

	const serialize = scope === 'write' ? toApiCompanionMinimal : toApiCompanion;
	return json({ companion: serialize(row) });
});
