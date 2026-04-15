import { fail, redirect } from '@sveltejs/kit';
import type { PageServerLoad, Actions } from './$types';
import { t } from '$lib/i18n';
import { db, schema } from '$lib/server/db';
import { eq, and, lt, gt, isNotNull } from 'drizzle-orm';
import { generateId } from '$lib/server/utils';
import { parseReminderType } from '$lib/server/validation';
import { completeReminder } from '$lib/server/reminders';

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

	return { companion, reminders };
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
		const recurringDays = isRecurring ? parseInt(String(data.get('recurringDays') ?? '0')) : null;

		if (!title) return fail(400, { error: t(locals.locale, 'error.titleRequired') });
		if (isNaN(dueAt.getTime()))
			return fail(400, { error: t(locals.locale, 'error.validDueDateRequired') });

		const id = generateId(15);
		await db.insert(schema.reminders).values({
			id,
			companionId: params.companionId,
			title,
			description,
			type,
			dueAt,
			isRecurring,
			recurringDays: recurringDays && recurringDays > 0 ? recurringDays : null,
			seriesId: isRecurring ? id : null,
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
		const recurringDays = isRecurring ? parseInt(String(data.get('recurringDays') ?? '0')) : null;

		if (!id) return fail(400, { error: t(locals.locale, 'error.missingId') });
		if (!title) return fail(400, { error: t(locals.locale, 'error.titleRequired') });
		if (isNaN(dueAt.getTime()))
			return fail(400, { error: t(locals.locale, 'error.validDueDateRequired') });

		const existing = await db.query.reminders.findFirst({
			where: and(eq(schema.reminders.id, id), eq(schema.reminders.companionId, params.companionId)),
			columns: { id: true }
		});
		if (!existing) return fail(404, { error: t(locals.locale, 'error.reminderNotFound') });

		await db
			.update(schema.reminders)
			.set({
				title,
				description,
				type,
				dueAt,
				isRecurring,
				recurringDays: recurringDays && recurringDays > 0 ? recurringDays : null
			})
			.where(eq(schema.reminders.id, id));

		return { updateSuccess: true };
	},

	complete: async ({ request, params, locals }) => {
		if (!locals.user) return fail(401, { error: t(locals.locale, 'error.unauthorized') });
		const data = await request.formData();
		const id = String(data.get('id') ?? '');

		const existing = await db.query.reminders.findFirst({
			where: and(eq(schema.reminders.id, id), eq(schema.reminders.companionId, params.companionId))
		});
		if (!existing) return fail(404, { error: t(locals.locale, 'error.reminderNotFound') });

		completeReminder(existing, locals.user.id);

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

		return { completeSuccess: true };
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

		db.transaction((tx) => {
			tx.update(schema.reminders)
				.set({ completedAt: null, completedBy: null })
				.where(eq(schema.reminders.id, id))
				.run();

			// If recurring, delete all future instances in this series
			if (existing.isRecurring && existing.seriesId) {
				tx.delete(schema.reminders)
					.where(
						and(
							eq(schema.reminders.seriesId, existing.seriesId),
							gt(schema.reminders.dueAt, existing.dueAt)
						)
					)
					.run();
			}
		});

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
