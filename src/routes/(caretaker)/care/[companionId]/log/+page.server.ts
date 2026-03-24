import { error, fail } from '@sveltejs/kit';
import type { PageServerLoad, Actions } from './$types';
import { db, schema } from '$lib/server/db';
import { eq, and, gte } from 'drizzle-orm';
import { generateId } from '$lib/server/utils';
import { parseDailyEventType } from '$lib/server/validation';
import { getShiftStatus } from '$lib/server/shifts';

export const load: PageServerLoad = async ({ params, parent }) => {
	const { companions, isOnShift } = await parent();
	if (!companions.find((c) => c.id === params.companionId)) {
		error(403, 'Not assigned to this companion');
	}

	const companion = await db.query.companions.findFirst({
		where: eq(schema.companions.id, params.companionId)
	});
	if (!companion) error(404, 'Companion not found');

	if (!isOnShift) {
		return { companion, todayEvents: [] };
	}

	const todayStart = new Date();
	todayStart.setHours(0, 0, 0, 0);

	const todayEvents = await db.query.dailyEvents.findMany({
		where: and(
			eq(schema.dailyEvents.companionId, params.companionId),
			gte(schema.dailyEvents.loggedAt, todayStart)
		),
		orderBy: (d, { desc }) => [desc(d.loggedAt)]
	});

	return { companion, todayEvents };
};

export const actions: Actions = {
	add: async ({ request, params, locals }) => {
		if (!locals.user) return fail(401, { error: 'Unauthorized.' });
		const { isOnShift } = await getShiftStatus(locals.user.id);
		if (!isOnShift) return fail(403, { error: 'No active shift.' });

		// Verify caretaker is assigned to this companion
		const assigned = await db.query.companionCaretakers.findFirst({
			where: and(
				eq(schema.companionCaretakers.userId, locals.user.id),
				eq(schema.companionCaretakers.companionId, params.companionId)
			)
		});
		if (!assigned) return fail(403, { error: 'Not assigned to this companion.' });

		const data = await request.formData();
		const type = parseDailyEventType(String(data.get('type') ?? ''));
		const notes = String(data.get('notes') ?? '').trim() || null;
		const durationRaw = data.get('durationMinutes');
		const durationMinutes = durationRaw ? parseInt(String(durationRaw)) : null;
		const loggedAt = data.get('loggedAt') ? new Date(String(data.get('loggedAt'))) : new Date();

		if (!type) return fail(400, { error: 'Type is required.' });

		await db.insert(schema.dailyEvents).values({
			id: generateId(15),
			companionId: params.companionId,
			type,
			notes,
			durationMinutes,
			loggedAt,
			loggedBy: locals.user.id
		});

		return { success: true };
	},

	delete: async ({ request, params, locals }) => {
		if (!locals.user) return fail(401, { error: 'Unauthorized.' });
		const { isOnShift } = await getShiftStatus(locals.user.id);
		if (!isOnShift) return fail(403, { error: 'No active shift.' });

		const data = await request.formData();
		const id = String(data.get('id') ?? '').trim();
		if (!id) return fail(400, { error: 'Missing entry ID.' });

		// Verify the entry belongs to this companion and was logged by this caretaker
		const entry = await db.query.dailyEvents.findFirst({
			where: and(
				eq(schema.dailyEvents.id, id),
				eq(schema.dailyEvents.companionId, params.companionId)
			)
		});

		if (!entry) return fail(404, { error: 'Entry not found.' });
		if (entry.loggedBy !== locals.user.id)
			return fail(403, { error: 'You can only delete your own entries.' });

		await db.delete(schema.dailyEvents).where(eq(schema.dailyEvents.id, id));

		return { success: true };
	}
};
