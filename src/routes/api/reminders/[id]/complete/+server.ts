import { error } from '@sveltejs/kit';
import { and, eq, isNotNull, lt } from 'drizzle-orm';
import { t } from '$lib/i18n';
import { db, schema } from '$lib/server/db';
import { apiRoute } from '$lib/server/auth/api-request';
import { withIdempotency } from '$lib/server/api-idempotency';
import { throwCareError } from '$lib/server/care-errors';
import { authorizeCompanions, listAllowedCompanions } from '$lib/server/companion-scope';
import { completeReminder } from '$lib/server/reminders';

// POST /api/reminders/{id}/complete: mark a reminder done. Recurring reminders
// spawn their next occurrence (via completeReminder). The token acts as its
// user, so a caretaker must be on shift and assigned to the reminder's
// companion. Send an Idempotency-Key to make a retry a no-op.
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
		// Hide existence as 404 when the token simply can't act on this reminder's
		// companion (not assigned, or the companion is archived → noTargets), so an
		// id-scoped write can't be used to probe reminder ids. An assigned caretaker
		// who is merely off-shift gets the real 403 noActiveShift.
		if (resolved.code === 'notAssigned' || resolved.code === 'noTargets')
			error(404, { code: 'notFound', message: t(locale, 'error.reminderNotFound') });
		throwCareError(resolved.code, locale);
	}

	return withIdempotency(
		{ request: event.request, tokenId, endpoint: `reminders/${id}/complete`, body: null },
		async () => {
			// Inside the idempotency callback so a keyed retry returns the cached
			// success instead of hitting this guard on the now-completed row.
			if (reminder.completedAt)
				error(409, { code: 'alreadyCompleted', message: t(locale, 'error.alreadyCompleted') });

			const result = completeReminder(reminder, user.id);
			if (!result)
				error(409, { code: 'alreadyCompleted', message: t(locale, 'error.alreadyCompleted') });
			const { completedAt, nextReminderId } = result;

			// Mirror the form: prune completed one-off reminders older than 30 days.
			const cutoff = new Date();
			cutoff.setDate(cutoff.getDate() - 30);
			await db
				.delete(schema.reminders)
				.where(
					and(
						eq(schema.reminders.companionId, reminder.companionId),
						isNotNull(schema.reminders.completedAt),
						eq(schema.reminders.isRecurring, false),
						lt(schema.reminders.createdAt, cutoff)
					)
				);

			return {
				status: 200,
				data: { id: reminder.id, completedAt: completedAt.toISOString(), nextReminderId }
			};
		}
	);
});
