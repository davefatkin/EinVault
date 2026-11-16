import { fail, redirect } from '@sveltejs/kit';
import type { PageServerLoad, Actions } from './$types';
import { t } from '$lib/i18n';
import { db, schema } from '$lib/server/db';
import { eq, and, lt, isNotNull } from 'drizzle-orm';
import { generateId } from '$lib/server/utils';
import {
	parseReminderType,
	parseRecurrence,
	parsePillsLeft,
	keepIntervalAnchor
} from '$lib/server/validation';
import {
	completeReminder,
	skipReminder,
	restoreReminder,
	mistapDose,
	withMistap
} from '$lib/server/reminders';
import { healthEventPrefillUrl, REMINDER_TO_HEALTH_TYPE } from '$lib/health';

export const load: PageServerLoad = async ({ params, locals, parent }) => {
	if (!locals.user) redirect(302, '/auth/login');
	const { companion } = await parent();

	const reminders = await db.query.reminders.findMany({
		where: eq(schema.reminders.companionId, params.companionId),
		orderBy: (r, { asc }) => [asc(r.dueAt)],
		with: {
			logger: { columns: { displayName: true } },
			completer: { columns: { displayName: true } }
		}
	});

	return {
		companion,
		reminders: await withMistap(reminders),
		defaultRecurrenceUnit: locals.user.defaultRecurrenceUnit ?? null
	};
};

export const actions: Actions = {
	add: async ({ request, params, locals }) => {
		if (!locals.user) return fail(401, { error: t(locals.locale, 'error.unauthorized') });
		const data = await request.formData();
		const title = String(data.get('title') ?? '').trim();
		const description = String(data.get('description') ?? '').trim() || null;
		const type = parseReminderType(String(data.get('type') ?? ''));
		const dueAt = new Date(String(data.get('dueAt') ?? ''));
		const isRecurring = data.get('isRecurring') === 'on';

		if (!title) return fail(400, { error: t(locals.locale, 'error.titleRequired') });
		if (isNaN(dueAt.getTime()))
			return fail(400, { error: t(locals.locale, 'error.validDueDateRequired') });

		const recurrence = isRecurring ? parseRecurrence(data, dueAt) : null;
		if (isRecurring && !recurrence)
			return fail(400, { error: t(locals.locale, 'error.invalidRecurrence') });

		// Only medication reminders track a supply; other types store NULL.
		const pillsLeft = type === 'medication' ? parsePillsLeft(data.get('pillsLeft')) : null;
		if (pillsLeft === 'invalid')
			return fail(400, { error: t(locals.locale, 'error.invalidPillsLeft') });

		const id = generateId(15);
		await db.insert(schema.reminders).values({
			id,
			companionId: params.companionId,
			title,
			description,
			type,
			dueAt,
			isRecurring,
			recurrenceUnit: recurrence?.unit ?? null,
			recurrenceInterval: recurrence?.interval ?? null,
			recurrenceAnchor: recurrence?.anchor ?? null,
			recurrenceAnchorValue: recurrence?.anchorValue ?? null,
			seriesId: isRecurring ? id : null,
			pillsLeft,
			loggedBy: locals.user.id
		});

		return { success: true };
	},

	update: async ({ request, params, locals }) => {
		if (!locals.user) return fail(401, { error: t(locals.locale, 'error.unauthorized') });
		const data = await request.formData();
		const id = String(data.get('id') ?? '');
		const title = String(data.get('title') ?? '').trim();
		const description = String(data.get('description') ?? '').trim() || null;
		const type = parseReminderType(String(data.get('type') ?? ''));
		const dueAt = new Date(String(data.get('dueAt') ?? ''));
		const isRecurring = data.get('isRecurring') === 'on';

		if (!id) return fail(400, { error: t(locals.locale, 'error.missingId') });
		if (!title) return fail(400, { error: t(locals.locale, 'error.titleRequired') });
		if (isNaN(dueAt.getTime()))
			return fail(400, { error: t(locals.locale, 'error.validDueDateRequired') });

		const parsedRecurrence = isRecurring ? parseRecurrence(data, dueAt) : null;
		if (isRecurring && !parsedRecurrence)
			return fail(400, { error: t(locals.locale, 'error.invalidRecurrence') });

		// Only medication reminders track a supply; other types store NULL.
		const pillsLeft = type === 'medication' ? parsePillsLeft(data.get('pillsLeft')) : null;
		if (pillsLeft === 'invalid')
			return fail(400, { error: t(locals.locale, 'error.invalidPillsLeft') });

		const existing = await db.query.reminders.findFirst({
			where: and(eq(schema.reminders.id, id), eq(schema.reminders.companionId, params.companionId)),
			columns: {
				dueAt: true,
				recurrenceUnit: true,
				recurrenceAnchor: true,
				recurrenceAnchorValue: true
			}
		});
		if (!existing) return fail(404, { error: t(locals.locale, 'error.reminderNotFound') });

		// An edit that doesn't touch the schedule (e.g. a refill on a clamped
		// Feb 28 occurrence) must not re-anchor the series to the clamped day.
		const recurrence = parsedRecurrence && keepIntervalAnchor(parsedRecurrence, dueAt, existing);

		await db
			.update(schema.reminders)
			.set({
				title,
				description,
				type,
				dueAt,
				isRecurring,
				recurrenceUnit: recurrence?.unit ?? null,
				recurrenceInterval: recurrence?.interval ?? null,
				recurrenceAnchor: recurrence?.anchor ?? null,
				recurrenceAnchorValue: recurrence?.anchorValue ?? null,
				// Forms that don't render the field (e.g. editing a resolved
				// occurrence) leave the stored count alone.
				...(data.has('pillsLeft') || type !== 'medication' ? { pillsLeft } : {})
			})
			.where(eq(schema.reminders.id, id));

		return { updateSuccess: true };
	},

	complete: async ({ request, params, locals }) => {
		if (!locals.user) return fail(401, { error: t(locals.locale, 'error.unauthorized') });
		const data = await request.formData();
		const id = String(data.get('id') ?? '');
		const andEvent = data.get('andEvent') === '1';

		const existing = await db.query.reminders.findFirst({
			where: and(eq(schema.reminders.id, id), eq(schema.reminders.companionId, params.companionId))
		});
		if (!existing) return fail(404, { error: t(locals.locale, 'error.reminderNotFound') });

		if (completeReminder(existing, locals.user.id) === 'noPillsLeft')
			return fail(409, { error: t(locals.locale, 'error.noPillsLeft') });

		// Prune completed non-recurring reminders older than 30 days
		const thirtyDaysAgo = new Date();
		thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
		await db
			.delete(schema.reminders)
			.where(
				and(
					eq(schema.reminders.companionId, params.companionId),
					isNotNull(schema.reminders.completedAt),
					eq(schema.reminders.isRecurring, false),
					lt(schema.reminders.createdAt, thirtyDaysAgo)
				)
			);

		if (andEvent) {
			const mapped = REMINDER_TO_HEALTH_TYPE[existing.type];
			redirect(
				303,
				healthEventPrefillUrl(params.companionId, {
					title: existing.title,
					description: existing.description,
					type: mapped ?? undefined
				})
			);
		}

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

	mistap: async ({ request, params, locals }) => {
		if (!locals.user) return fail(401, { error: t(locals.locale, 'error.unauthorized') });
		const data = await request.formData();
		const id = String(data.get('id') ?? '');

		const existing = await db.query.reminders.findFirst({
			where: and(eq(schema.reminders.id, id), eq(schema.reminders.companionId, params.companionId))
		});
		if (!existing) return fail(404, { error: t(locals.locale, 'error.reminderNotFound') });

		if (!mistapDose(existing, String(data.get('doseId') ?? '')))
			return fail(409, { error: t(locals.locale, 'error.nothingToMistap') });

		return { mistapSuccess: true };
	},

	restore: async ({ request, params, locals }) => {
		if (!locals.user) return fail(401, { error: t(locals.locale, 'error.unauthorized') });
		const data = await request.formData();
		const id = String(data.get('id') ?? '');
		if (!id) return fail(400, { error: t(locals.locale, 'error.missingId') });

		const existing = await db.query.reminders.findFirst({
			where: and(eq(schema.reminders.id, id), eq(schema.reminders.companionId, params.companionId))
		});
		if (!existing) return fail(404, { error: t(locals.locale, 'error.reminderNotFound') });

		restoreReminder(existing);

		return { restoreSuccess: true };
	},

	delete: async ({ request, params, locals }) => {
		if (!locals.user) return fail(401, { error: t(locals.locale, 'error.unauthorized') });
		const data = await request.formData();
		const id = String(data.get('id') ?? '');

		const existing = await db.query.reminders.findFirst({
			where: and(eq(schema.reminders.id, id), eq(schema.reminders.companionId, params.companionId)),
			columns: { id: true }
		});
		if (!existing) return fail(404, { error: t(locals.locale, 'error.reminderNotFound') });

		await db.delete(schema.reminders).where(eq(schema.reminders.id, id));
		return { deleteSuccess: true };
	}
};
