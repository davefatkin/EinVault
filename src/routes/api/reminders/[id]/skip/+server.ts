import { error } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';
import { t } from '$lib/i18n';
import { db, schema } from '$lib/server/db';
import { apiRoute } from '$lib/server/auth/api-request';
import { withIdempotency } from '$lib/server/api-idempotency';
import { throwCareError } from '$lib/server/care-errors';
import { authorizeCompanions, listAllowedCompanions } from '$lib/server/companion-scope';
import { skipReminder } from '$lib/server/reminders';

// POST /api/reminders/{id}/skip: skip the current occurrence of a recurring
// reminder — resolves it without a done record and spawns the next occurrence.
// One-off reminders 400. The token acts as its user, so a caretaker must be on
// shift and assigned to the reminder's companion. Send an Idempotency-Key to
// make a retry a no-op.
export const POST = apiRoute(async ({ event, user, tokenId, locale }) => {
	const id = event.params.id!;
	const reminder = await db.query.reminders.findFirst({
		where: eq(schema.reminders.id, id)
	});
	// Unknown id → 404. An id for a companion this token can't access ALSO reads
	// as 404 below, so a token can't enumerate other users' reminder ids.
	if (!reminder) error(404, { code: 'notFound', message: t(locale, 'error.reminderNotFound') });

	// Assignment-only gate first: an id on a companion this token isn't assigned to
	// (or an archived companion) is a uniform 404 regardless of shift state, so an
	// off-shift caretaker can't use the 403/404 split to probe reminder existence.
	const allowed = await listAllowedCompanions({ id: user.id, role: user.role });
	if (!allowed.includes(reminder.companionId))
		error(404, { code: 'notFound', message: t(locale, 'error.reminderNotFound') });

	const resolved = await authorizeCompanions({ id: user.id, role: user.role }, [
		reminder.companionId
	]);
	if (!resolved.ok) {
		if (resolved.code === 'notAssigned' || resolved.code === 'noTargets')
			error(404, { code: 'notFound', message: t(locale, 'error.reminderNotFound') });
		throwCareError(resolved.code, locale);
	}

	if (!reminder.isRecurring)
		error(400, {
			code: 'notRecurring',
			message: t(locale, 'error.cannotSkipNonRecurring')
		});

	return withIdempotency(
		{ request: event.request, tokenId, endpoint: `reminders/${id}/skip`, body: null },
		async () => {
			// Inside the idempotency callback so a keyed retry returns the cached
			// success instead of hitting this guard on the now-resolved row.
			if (reminder.completedAt)
				error(409, { code: 'alreadyCompleted', message: t(locale, 'error.alreadyCompleted') });

			const result = skipReminder(reminder, user.id);
			if (!result)
				error(409, { code: 'alreadyCompleted', message: t(locale, 'error.alreadyCompleted') });
			const { completedAt, nextReminderId } = result;

			return {
				status: 200,
				data: { id: reminder.id, skippedAt: completedAt.toISOString(), nextReminderId }
			};
		}
	);
});
