import { error, fail, redirect } from '@sveltejs/kit';
import type { PageServerLoad, Actions } from './$types';
import { db, schema } from '$lib/server/db';
import { eq, and, gte, lt } from 'drizzle-orm';
import { generateId } from '$lib/server/utils';
import { parseMood, parseDailyEventType, isValidDate } from '$lib/server/validation';
import { localDateISO } from '$lib/date';
import { upsertJournalEntry } from '$lib/server/journal';

export const load: PageServerLoad = async ({ params, locals, parent }) => {
	if (!locals.user) redirect(302, '/auth/login');
	const { companionId, date } = params;

	if (!isValidDate(date)) error(400, 'Invalid date format');

	const { companion } = await parent();

	const entry = await db.query.journalEntries.findFirst({
		where: and(
			eq(schema.journalEntries.companionId, companionId),
			eq(schema.journalEntries.date, date)
		)
	});

	// Load photos for this date
	const photos = entry
		? await db.query.journalPhotos.findMany({
				where: eq(schema.journalPhotos.entryId, entry.id),
				orderBy: (p, { asc }) => [asc(p.createdAt)]
			})
		: [];

	const recentEntries = await db.query.journalEntries.findMany({
		where: eq(schema.journalEntries.companionId, companionId),
		orderBy: (j, { desc }) => [desc(j.date)],
		limit: 30,
		columns: { date: true, mood: true, id: true }
	});

	const [y, m, d] = date.split('-').map(Number);
	const dayStart = new Date(y, m - 1, d); // local midnight (respects TZ)
	const dayEnd = new Date(y, m - 1, d + 1); // next local midnight

	const dailyEvents = await db.query.dailyEvents.findMany({
		where: and(
			eq(schema.dailyEvents.companionId, companionId),
			gte(schema.dailyEvents.loggedAt, dayStart),
			lt(schema.dailyEvents.loggedAt, dayEnd)
		),
		orderBy: (d, { asc }) => [asc(d.loggedAt)]
	});

	const today = localDateISO();

	return {
		companion,
		entry: entry ?? null,
		photos,
		recentEntries,
		dailyEvents,
		date,
		today,
		isToday: date === today
	};
};

export const actions: Actions = {
	save: async ({ params, request, locals }) => {
		if (!locals.user) return fail(401, { error: 'Unauthorized.' });
		const { companionId, date } = params;
		if (!isValidDate(date)) return fail(400, { error: 'Invalid date' });

		const data = await request.formData();
		const body = String(data.get('body') ?? '');
		const moodValue = parseMood(data.get('mood') as string | null);

		await upsertJournalEntry(companionId, date, body, moodValue, locals.user.id);

		return { success: true };
	},

	addActivity: async ({ params, request, locals }) => {
		if (!locals.user) return fail(401, { error: 'Unauthorized.' });
		const { companionId, date } = params;
		if (!isValidDate(date)) return fail(400, { error: 'Invalid date' });

		const data = await request.formData();
		const type = parseDailyEventType(String(data.get('type') ?? ''));
		const notes = String(data.get('notes') ?? '').trim() || null;
		const durationRaw = data.get('durationMinutes');
		const durationMinutes = durationRaw ? parseInt(String(durationRaw)) : null;
		const loggedAt = data.get('loggedAt') ? new Date(String(data.get('loggedAt'))) : new Date();

		if (!type) return fail(400, { error: 'Event type is required.' });

		await db.insert(schema.dailyEvents).values({
			id: generateId(15),
			companionId,
			type,
			notes,
			durationMinutes,
			loggedAt,
			loggedBy: locals.user.id
		});

		return { addSuccess: true };
	},

	updateActivity: async ({ request, params, locals }) => {
		if (!locals.user) return fail(401, { error: 'Unauthorized.' });
		const { companionId } = params;
		const data = await request.formData();
		const id = String(data.get('id') ?? '');
		const type = parseDailyEventType(String(data.get('type') ?? ''));
		const notes = String(data.get('notes') ?? '').trim() || null;
		const durationRaw = data.get('durationMinutes');
		const durationMinutes = durationRaw ? parseInt(String(durationRaw)) : null;
		const loggedAt = new Date(String(data.get('loggedAt') ?? ''));

		if (!id) return fail(400, { error: 'Missing id.' });
		if (!type) return fail(400, { error: 'Event type is required.' });

		const existing = await db.query.dailyEvents.findFirst({
			where: and(eq(schema.dailyEvents.id, id), eq(schema.dailyEvents.companionId, companionId)),
			columns: { id: true }
		});
		if (!existing) return fail(404, { error: 'Event not found.' });

		await db
			.update(schema.dailyEvents)
			.set({ type, notes, durationMinutes, loggedAt })
			.where(eq(schema.dailyEvents.id, id));

		return { updateActivitySuccess: true };
	},

	deleteActivity: async ({ request, params, locals }) => {
		if (!locals.user) return fail(401, { error: 'Unauthorized.' });
		const { companionId } = params;
		const data = await request.formData();
		const id = String(data.get('id') ?? '');
		if (!id) return fail(400, { error: 'Missing id.' });

		const existing = await db.query.dailyEvents.findFirst({
			where: and(eq(schema.dailyEvents.id, id), eq(schema.dailyEvents.companionId, companionId)),
			columns: { id: true }
		});
		if (!existing) return fail(404, { error: 'Event not found.' });

		await db.delete(schema.dailyEvents).where(eq(schema.dailyEvents.id, id));
		return { deleteActivitySuccess: true };
	}
};
