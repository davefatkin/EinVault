import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { db, schema } from '$lib/server/db';
import { eq, gte, and, lte } from 'drizzle-orm';
import { localDateISO } from '$lib/date';

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
			limit: 5
		}),
		db.query.dailyEvents.findMany({
			where: eq(schema.dailyEvents.companionId, params.companionId),
			orderBy: (d, { desc }) => [desc(d.loggedAt)],
			limit: 10
		}),
		db.query.reminders.findMany({
			where: and(
				eq(schema.reminders.companionId, params.companionId),
				eq(schema.reminders.isDismissed, false)
			),
			orderBy: (r, { asc }) => [asc(r.dueAt)],
			limit: 5
		}),
		db.query.weightEntries.findMany({
			where: eq(schema.weightEntries.companionId, params.companionId),
			orderBy: (w, { desc }) => [desc(w.recordedAt)],
			limit: 10
		}),
		db.query.journalEntries.findFirst({
			where: and(
				eq(schema.journalEntries.companionId, params.companionId),
				eq(schema.journalEntries.date, localDateISO(now))
			)
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
