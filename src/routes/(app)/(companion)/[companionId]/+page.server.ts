import { fail, redirect } from '@sveltejs/kit';
import type { PageServerLoad, Actions } from './$types';
import { t } from '$lib/i18n';
import { db, schema } from '$lib/server/db';
import { eq, gte, and, lte } from 'drizzle-orm';
import { localDateISO } from '$lib/date';
import { dismissReminder } from '$lib/server/reminders';

export const load: PageServerLoad = async ({ params, locals, parent }) => {
	if (!locals.user) redirect(302, '/auth/login');
	const { companion } = await parent();

	const now = new Date();

	const [
		recentHealth,
		recentDaily,
		upcomingReminders,
		recentWeights,
		todayJournal,
		activeCaretakerShift
	] = await Promise.all([
		db.query.healthEvents.findMany({
			where: eq(schema.healthEvents.companionId, params.companionId),
			orderBy: (h, { desc }) => [desc(h.occurredAt)],
			limit: 5,
			with: { logger: { columns: { displayName: true } } }
		}),
		db.query.dailyEvents.findMany({
			where: eq(schema.dailyEvents.companionId, params.companionId),
			orderBy: (d, { desc }) => [desc(d.loggedAt)],
			limit: 10,
			with: { logger: { columns: { displayName: true } } }
		}),
		db.query.reminders.findMany({
			where: and(
				eq(schema.reminders.companionId, params.companionId),
				eq(schema.reminders.isDismissed, false)
			),
			orderBy: (r, { asc }) => [asc(r.dueAt)],
			limit: 5,
			with: { logger: { columns: { displayName: true } } }
		}),
		db.query.weightEntries.findMany({
			where: eq(schema.weightEntries.companionId, params.companionId),
			orderBy: (w, { desc }) => [desc(w.recordedAt)],
			limit: 10,
			with: { logger: { columns: { displayName: true } } }
		}),
		db.query.journalEntries.findFirst({
			where: and(
				eq(schema.journalEntries.companionId, params.companionId),
				eq(schema.journalEntries.date, localDateISO(now))
			),
			with: { logger: { columns: { displayName: true } } }
		}),
		db
			.select({
				shiftId: schema.caretakerShifts.id,
				startAt: schema.caretakerShifts.startAt,
				endAt: schema.caretakerShifts.endAt,
				notes: schema.caretakerShifts.notes,
				displayName: schema.users.displayName,
				phone: schema.users.phone,
				email: schema.users.email
			})
			.from(schema.caretakerShifts)
			.innerJoin(
				schema.companionCaretakers,
				and(
					eq(schema.companionCaretakers.userId, schema.caretakerShifts.userId),
					eq(schema.companionCaretakers.companionId, params.companionId)
				)
			)
			.innerJoin(schema.users, eq(schema.users.id, schema.caretakerShifts.userId))
			.where(and(lte(schema.caretakerShifts.startAt, now), gte(schema.caretakerShifts.endAt, now)))
			.limit(1)
			.then((rows) => rows[0] ?? null)
	]);

	return {
		companion,
		recentHealth,
		recentDaily,
		upcomingReminders,
		recentWeights,
		todayJournal,
		activeCaretakerShift
	};
};

export const actions: Actions = {
	dismiss: async ({ request, params, locals }) => {
		if (!locals.user) return fail(401, { error: t(locals.locale, 'error.unauthorized') });

		const data = await request.formData();
		const id = String(data.get('id') ?? '');

		const existing = await db.query.reminders.findFirst({
			where: and(eq(schema.reminders.id, id), eq(schema.reminders.companionId, params.companionId))
		});
		if (!existing) return fail(404, { error: t(locals.locale, 'error.reminderNotFound') });

		await dismissReminder(existing);

		return { dismissSuccess: true };
	}
};
