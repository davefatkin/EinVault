import { fail, redirect } from '@sveltejs/kit';
import type { PageServerLoad, Actions } from './$types';
import { db, schema } from '$lib/server/db';
import { eq, and, lt } from 'drizzle-orm';
import { generateId } from '$lib/server/utils';
import { parseReminderType } from '$lib/server/validation';
import { dismissReminder } from '$lib/server/reminders';

export const load: PageServerLoad = async ({ params, locals, parent }) => {
	if (!locals.user) redirect(302, '/auth/login');
	const { companion } = await parent();

	const reminders = await db.query.reminders.findMany({
		where: eq(schema.reminders.companionId, params.companionId),
		orderBy: (r, { asc }) => [asc(r.dueAt)]
	});

	return { companion, reminders };
};

export const actions: Actions = {
	add: async ({ request, params, locals }) => {
		if (!locals.user) return fail(401, { error: 'Unauthorized.' });
		const data = await request.formData();
		const title = String(data.get('title') ?? '').trim();
		const description = String(data.get('description') ?? '').trim() || null;
		const type = parseReminderType(String(data.get('type') ?? ''));
		const dueAt = new Date(String(data.get('dueAt') ?? ''));
		const isRecurring = data.get('isRecurring') === 'on';
		const recurringDays = isRecurring ? parseInt(String(data.get('recurringDays') ?? '0')) : null;

		if (!title) return fail(400, { error: 'Title is required.' });
		if (isNaN(dueAt.getTime())) return fail(400, { error: 'Valid due date is required.' });

		await db.insert(schema.reminders).values({
			id: generateId(15),
			companionId: params.companionId,
			title,
			description,
			type,
			dueAt,
			isRecurring,
			recurringDays: recurringDays && recurringDays > 0 ? recurringDays : null
		});

		return { success: true };
	},

	update: async ({ request, params, locals }) => {
		if (!locals.user) return fail(401, { error: 'Unauthorized.' });
		const data = await request.formData();
		const id = String(data.get('id') ?? '');
		const title = String(data.get('title') ?? '').trim();
		const description = String(data.get('description') ?? '').trim() || null;
		const type = parseReminderType(String(data.get('type') ?? ''));
		const dueAt = new Date(String(data.get('dueAt') ?? ''));
		const isRecurring = data.get('isRecurring') === 'on';
		const recurringDays = isRecurring ? parseInt(String(data.get('recurringDays') ?? '0')) : null;

		if (!id) return fail(400, { error: 'Missing id.' });
		if (!title) return fail(400, { error: 'Title is required.' });
		if (isNaN(dueAt.getTime())) return fail(400, { error: 'Valid due date is required.' });

		const existing = await db.query.reminders.findFirst({
			where: and(eq(schema.reminders.id, id), eq(schema.reminders.companionId, params.companionId)),
			columns: { id: true }
		});
		if (!existing) return fail(404, { error: 'Reminder not found.' });

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

	dismiss: async ({ request, params, locals }) => {
		if (!locals.user) return fail(401, { error: 'Unauthorized.' });
		const data = await request.formData();
		const id = String(data.get('id') ?? '');

		const existing = await db.query.reminders.findFirst({
			where: and(eq(schema.reminders.id, id), eq(schema.reminders.companionId, params.companionId))
		});
		if (!existing) return fail(404, { error: 'Reminder not found.' });

		await dismissReminder(existing);

		// Prune dismissed non-recurring reminders older than 30 days
		const thirtyDaysAgo = new Date();
		thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
		await db
			.delete(schema.reminders)
			.where(
				and(
					eq(schema.reminders.companionId, params.companionId),
					eq(schema.reminders.isDismissed, true),
					eq(schema.reminders.isRecurring, false),
					lt(schema.reminders.createdAt, thirtyDaysAgo)
				)
			);

		return { dismissSuccess: true };
	},

	undismiss: async ({ request, params, locals }) => {
		if (!locals.user) return fail(401, { error: 'Unauthorized.' });
		const data = await request.formData();
		const id = String(data.get('id') ?? '');
		if (!id) return fail(400, { error: 'Missing id.' });

		const existing = await db.query.reminders.findFirst({
			where: and(eq(schema.reminders.id, id), eq(schema.reminders.companionId, params.companionId)),
			columns: { id: true }
		});
		if (!existing) return fail(404, { error: 'Reminder not found.' });

		await db
			.update(schema.reminders)
			.set({ isDismissed: false })
			.where(eq(schema.reminders.id, id));
		return { undismissSuccess: true };
	},

	delete: async ({ request, params, locals }) => {
		if (!locals.user) return fail(401, { error: 'Unauthorized.' });
		const data = await request.formData();
		const id = String(data.get('id') ?? '');

		const existing = await db.query.reminders.findFirst({
			where: and(eq(schema.reminders.id, id), eq(schema.reminders.companionId, params.companionId)),
			columns: { id: true }
		});
		if (!existing) return fail(404, { error: 'Reminder not found.' });

		await db.delete(schema.reminders).where(eq(schema.reminders.id, id));
		return { deleteSuccess: true };
	}
};
