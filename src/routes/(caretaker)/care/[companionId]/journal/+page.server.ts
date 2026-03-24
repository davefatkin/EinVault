import { error, fail } from '@sveltejs/kit';
import type { PageServerLoad, Actions } from './$types';
import { db, schema } from '$lib/server/db';
import { eq, and } from 'drizzle-orm';
import { parseMood } from '$lib/server/validation';
import { getShiftStatus } from '$lib/server/shifts';
import { localDateISO } from '$lib/date';
import { upsertJournalEntry } from '$lib/server/journal';

export const load: PageServerLoad = async ({ params, parent }) => {
	const { companions, isOnShift } = await parent();
	if (!companions.find((c) => c.id === params.companionId)) {
		error(403, 'Not assigned to this companion');
	}

	const companion = await db.query.companions.findFirst({
		where: eq(schema.companions.id, params.companionId)
	});
	if (!companion) error(404, 'Companion not found');

	const today = localDateISO();

	if (!isOnShift) {
		return { companion, todayEntry: null, photos: [], today };
	}

	const todayEntry = await db.query.journalEntries.findFirst({
		where: and(
			eq(schema.journalEntries.companionId, params.companionId),
			eq(schema.journalEntries.date, today)
		)
	});

	const photos = todayEntry
		? await db.query.journalPhotos.findMany({
				where: eq(schema.journalPhotos.entryId, todayEntry.id),
				orderBy: (p, { asc }) => [asc(p.createdAt)]
			})
		: [];

	return {
		companion,
		todayEntry: todayEntry ?? null,
		photos,
		today
	};
};

export const actions: Actions = {
	save: async ({ params, request, locals }) => {
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

		const today = localDateISO();
		const data = await request.formData();
		const body = String(data.get('body') ?? '');
		const moodValue = parseMood(data.get('mood') as string | null);

		await upsertJournalEntry(params.companionId, today, body, moodValue, locals.user.id);

		return { success: true };
	}
};
