import { fail, redirect } from '@sveltejs/kit';
import type { PageServerLoad, Actions } from './$types';
import { db, schema } from '$lib/server/db';
import { and, eq, gte, inArray, isNull, lte } from 'drizzle-orm';
import { localDateISO } from '$lib/date';
import { completeReminder } from '$lib/server/reminders';
import { t } from '$lib/i18n';

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;
const RECENT_EVENT_LIMIT = 30;

export const load: PageServerLoad = async ({ locals, parent }) => {
	if (!locals.user) redirect(302, '/auth/login');

	const { companions } = await parent();

	if (companions.length === 0) redirect(302, '/companions/new');
	if (companions.length === 1) redirect(302, `/${companions[0].id}`);

	const now = new Date();
	const in7d = new Date(now.getTime() + SEVEN_DAYS_MS);
	const ago7d = new Date(now.getTime() - SEVEN_DAYS_MS);
	const today = localDateISO(now);
	const ids = companions.map((c) => c.id);

	const [upcomingReminders, recentDaily, recentHealth, todayJournal] = await Promise.all([
		db.query.reminders.findMany({
			where: and(
				inArray(schema.reminders.companionId, ids),
				isNull(schema.reminders.completedAt),
				gte(schema.reminders.dueAt, now),
				lte(schema.reminders.dueAt, in7d)
			),
			orderBy: (r, { asc }) => [asc(r.dueAt)],
			with: { logger: { columns: { displayName: true } } }
		}),
		db.query.dailyEvents.findMany({
			where: and(
				inArray(schema.dailyEvents.companionId, ids),
				gte(schema.dailyEvents.loggedAt, ago7d)
			),
			orderBy: (d, { desc }) => [desc(d.loggedAt)],
			limit: RECENT_EVENT_LIMIT,
			with: { logger: { columns: { displayName: true } } }
		}),
		db.query.healthEvents.findMany({
			where: and(
				inArray(schema.healthEvents.companionId, ids),
				gte(schema.healthEvents.occurredAt, ago7d)
			),
			orderBy: (h, { desc }) => [desc(h.occurredAt)],
			limit: RECENT_EVENT_LIMIT,
			with: { logger: { columns: { displayName: true } } }
		}),
		db.query.journalEntries.findMany({
			where: and(
				inArray(schema.journalEntries.companionId, ids),
				eq(schema.journalEntries.date, today)
			),
			with: { logger: { columns: { displayName: true } } }
		})
	]);

	const todayJournalByCompanion = Object.fromEntries(todayJournal.map((j) => [j.companionId, j]));

	return {
		upcomingReminders,
		recentDaily,
		recentHealth,
		todayJournalByCompanion
	};
};

export const actions: Actions = {
	complete: async ({ request, locals }) => {
		if (!locals.user) return fail(401, { error: t(locals.locale, 'error.unauthorized') });
		if (locals.user.role === 'caretaker')
			return fail(403, { error: t(locals.locale, 'error.forbidden') });

		const data = await request.formData();
		const id = String(data.get('id') ?? '');

		const reminder = await db.query.reminders.findFirst({
			where: eq(schema.reminders.id, id)
		});
		if (!reminder) return fail(404, { error: t(locals.locale, 'error.reminderNotFound') });

		const companion = await db.query.companions.findFirst({
			where: and(
				eq(schema.companions.id, reminder.companionId),
				eq(schema.companions.isActive, true)
			)
		});
		if (!companion) return fail(404, { error: t(locals.locale, 'error.reminderNotFound') });

		completeReminder(reminder, locals.user.id);

		return { completeSuccess: true };
	}
};
