import { fail, redirect } from '@sveltejs/kit';
import type { PageServerLoad, Actions } from './$types';
import { db, schema } from '$lib/server/db';
import { and, eq, gte, inArray, isNull, lte } from 'drizzle-orm';
import { localDateISO } from '$lib/date';
import { completeReminder } from '$lib/server/reminders';
import { t } from '$lib/i18n';
import { healthEventPrefillUrl, REMINDER_TO_HEALTH_TYPE } from '$lib/health';
import {
	parseDailyEventType,
	parseDurationMinutes,
	parseLoggedAt,
	parseIdArray,
	exceedsLen
} from '$lib/server/validation';
import { MAX_NOTE_LEN } from '$lib/server/env';
import { logDailyEvent } from '$lib/server/daily-events';
import { listQuickLogButtons } from '$lib/server/quick-logs';
import { handleQuickLogExecute } from '$lib/server/quick-log-actions';

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;
const RECENT_EVENT_LIMIT = 30;

export const load: PageServerLoad = async ({ locals, parent }) => {
	if (!locals.user) redirect(302, '/auth/login');

	const { companions } = await parent();

	// 0 companions → fall through to the dashboard's first-run welcome (SP7).
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

	const quickLogButtons = await listQuickLogButtons({
		id: locals.user.id,
		role: locals.user.role
	});

	return {
		upcomingReminders,
		recentDaily,
		recentHealth,
		todayJournalByCompanion,
		quickLogButtons
	};
};

export const actions: Actions = {
	complete: async ({ request, locals }) => {
		if (!locals.user) return fail(401, { error: t(locals.locale, 'error.unauthorized') });
		if (locals.user.role === 'caretaker')
			return fail(403, { error: t(locals.locale, 'error.forbidden') });

		const data = await request.formData();
		const id = String(data.get('id') ?? '');
		const andEvent = data.get('andEvent') === '1';

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

		if (andEvent) {
			const mapped = REMINDER_TO_HEALTH_TYPE[reminder.type];
			redirect(
				303,
				healthEventPrefillUrl(reminder.companionId, {
					title: reminder.title,
					description: reminder.description,
					type: mapped ?? undefined
				})
			);
		}

		return { completeSuccess: true };
	},

	quickLog: async ({ request, locals }) => {
		if (!locals.user) return fail(401, { error: t(locals.locale, 'error.unauthorized') });
		if (locals.user.role === 'caretaker')
			return fail(403, { error: t(locals.locale, 'error.forbidden') });

		const data = await request.formData();
		const type = parseDailyEventType(String(data.get('type') ?? ''));
		const rawNotes = String(data.get('notes') ?? '');
		if (exceedsLen(rawNotes, MAX_NOTE_LEN))
			return fail(400, { error: t(locals.locale, 'error.noteTooLong', { max: MAX_NOTE_LEN }) });
		const notes = rawNotes.trim() || null;
		const durationMinutes = parseDurationMinutes(data.get('durationMinutes'));
		const loggedAt = parseLoggedAt(data.get('loggedAt')) ?? new Date();

		if (!type) return fail(400, { error: t(locals.locale, 'error.typeRequired') });

		const companionIds = parseIdArray(data.getAll('companionIds'));
		if (companionIds.length === 0)
			return fail(400, { error: t(locals.locale, 'page.log.selectAtLeastOne') });

		const result = await logDailyEvent(
			{ id: locals.user.id, role: locals.user.role },
			companionIds,
			{ type, notes, durationMinutes, loggedAt }
		);
		if (!result.ok) {
			return fail(404, { error: t(locals.locale, 'error.companionNotFound') });
		}

		return { success: true };
	},

	executeQuickLog: async ({ request, locals }) => {
		if (!locals.user) return fail(401, { error: t(locals.locale, 'error.unauthorized') });
		return handleQuickLogExecute(locals.user, request, locals.locale);
	}
};
