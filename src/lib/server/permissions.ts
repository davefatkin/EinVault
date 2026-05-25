import { error, type RequestEvent } from '@sveltejs/kit';
import { and, eq } from 'drizzle-orm';
import { t } from '$lib/i18n';
import { db, schema } from '$lib/server/db';

// Members and admins can always edit a companion. Caretakers may only edit
// when they are assigned to that companion. Throws via SvelteKit's error()
// helper on failure; returns void on success.
export async function assertCanEditCompanion(
	locals: RequestEvent['locals'],
	companionId: string
): Promise<void> {
	if (!locals.user) error(401, t(locals.locale, 'error.unauthorized'));
	if (locals.user.role !== 'caretaker') return;
	const assigned = await db.query.companionCaretakers.findFirst({
		where: and(
			eq(schema.companionCaretakers.userId, locals.user.id),
			eq(schema.companionCaretakers.companionId, companionId)
		)
	});
	if (!assigned) error(403, t(locals.locale, 'error.forbidden'));
}
