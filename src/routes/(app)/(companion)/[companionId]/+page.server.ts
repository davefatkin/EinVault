import { fail, redirect } from '@sveltejs/kit';
import type { PageServerLoad, Actions } from './$types';
import { t } from '#lib/i18n/index.js';
import { db, schema } from '#lib/server/db/index.js';
import { eq, gte, and, lte, isNull, isNotNull } from 'drizzle-orm';
import { localDateISO } from '#lib/date.js';
import { celebrationBanner, CELEBRATION_COOKIE } from '#lib/celebrations.js';
import { completeReminder, skipReminder } from '#lib/server/reminders.js';
import { reminderLogEventUrl } from '#lib/health.js';
import { listQuickLogButtons } from '#lib/server/quick-logs.js';
import { handleQuickLogExecute } from '#lib/server/quick-log-actions.js';
import { handleMoodTrendDaysUpdate } from '#lib/server/account.js';
import { listOpenIncidents } from '#lib/server/incidents.js';
import { listMedicationSummaries } from '#lib/server/medications.js';
import { givenAction } from '#lib/server/medication-actions.js';
import { addDaysISO, MOOD_TREND_MAX, resolveMoodTrendDays, type Mood } from '#lib/moodTrend.js';

export const load: PageServerLoad = async ({ params, locals, parent, cookies }) => {
	if (!locals.user) redirect(302, '/auth/login');
	const { companion, today } = await parent();

	const now = new Date();
	const moodToday = localDateISO(now);

	const [
		recentHealth,
		recentDaily,
		upcomingReminders,
		recentWeights,
		todayJournal,
		activeCaretakerShift,
		recentDocuments,
		moodHistory,
		openIncidents,
		medications
	] = await Promise.all([
		db.query.healthEvents.findMany({
			where: eq(schema.healthEvents.companionId, params.companionId),
			orderBy: (h, { desc }) => [desc(h.occurredAt)],
			limit: 5,
			with: { logger: { columns: { displayName: true } } }
		}),
		db.query.dailyEvents.findMany({
			where: eq(schema.dailyEvents.companionId, params.companionId),
			orderBy: (d, { desc }) => [desc(d.loggedAt), desc(d.createdAt)],
			limit: 10,
			with: { logger: { columns: { displayName: true } } }
		}),
		db.query.reminders.findMany({
			where: and(
				eq(schema.reminders.companionId, params.companionId),
				isNull(schema.reminders.completedAt)
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
			.then((rows) => rows[0] ?? null),
		db.query.documents.findMany({
			where: eq(schema.documents.companionId, params.companionId),
			orderBy: (d, { desc }) => [desc(d.createdAt)],
			limit: 5
		}),
		db
			.select({ date: schema.journalEntries.date, mood: schema.journalEntries.mood })
			.from(schema.journalEntries)
			.where(
				and(
					eq(schema.journalEntries.companionId, params.companionId),
					isNotNull(schema.journalEntries.mood),
					gte(schema.journalEntries.date, addDaysISO(moodToday, -(MOOD_TREND_MAX - 1)))
				)
			)
			.then((rows) => rows.filter((r): r is { date: string; mood: Mood } => r.mood !== null)),
		listOpenIncidents([params.companionId]),
		// The card shows only while something is active.
		listMedicationSummaries([params.companionId], { activeOnly: true })
	]);

	const quickLogButtons = await listQuickLogButtons(
		{ id: locals.user.id, role: locals.user.role },
		params.companionId
	);

	const celebrations = celebrationBanner([companion], today, cookies.get(CELEBRATION_COOKIE));

	return {
		companion,
		celebrations,
		recentHealth,
		recentDaily,
		upcomingReminders,
		recentWeights,
		todayJournal,
		activeCaretakerShift,
		recentDocuments,
		quickLogButtons,
		moodHistory,
		openIncidents,
		medications,
		moodTrendDays: resolveMoodTrendDays(locals.user.moodTrendDays),
		moodToday
	};
};

export const actions: Actions = {
	given: givenAction,

	complete: async ({ request, params, locals }) => {
		if (!locals.user) return fail(401, { error: t(locals.locale, 'error.unauthorized') });

		const data = await request.formData();
		const id = String(data.get('id') ?? '');
		const andEvent = data.get('andEvent') === '1';

		const existing = await db.query.reminders.findFirst({
			where: and(eq(schema.reminders.id, id), eq(schema.reminders.companionId, params.companionId))
		});
		if (!existing) return fail(404, { error: t(locals.locale, 'error.reminderNotFound') });

		completeReminder(existing, locals.user.id);

		const logEventUrl = andEvent ? reminderLogEventUrl(existing) : null;
		if (logEventUrl) redirect(303, logEventUrl);

		return { completeSuccess: true };
	},

	skip: async ({ request, params, locals }) => {
		if (!locals.user) return fail(401, { error: t(locals.locale, 'error.unauthorized') });

		const data = await request.formData();
		const id = String(data.get('id') ?? '');

		const existing = await db.query.reminders.findFirst({
			where: and(eq(schema.reminders.id, id), eq(schema.reminders.companionId, params.companionId))
		});
		if (!existing) return fail(404, { error: t(locals.locale, 'error.reminderNotFound') });
		if (!existing.isRecurring)
			return fail(400, { error: t(locals.locale, 'error.cannotSkipNonRecurring') });

		skipReminder(existing, locals.user.id);

		return { skipSuccess: true };
	},

	executeQuickLog: async ({ request, locals }) => {
		if (!locals.user) return fail(401, { error: t(locals.locale, 'error.unauthorized') });
		return handleQuickLogExecute(locals.user, request, locals.locale);
	},

	setMoodTrendDays: async ({ request, locals }) => {
		if (!locals.user) return fail(401, { error: t(locals.locale, 'error.unauthorized') });
		return handleMoodTrendDaysUpdate(locals.user, request, locals.locale);
	}
};
