import { fail } from '@sveltejs/kit';
import type { PageServerLoad, Actions } from './$types';
import { t } from '$lib/i18n';
import { db, schema } from '$lib/server/db';
import { eq, and, gte } from 'drizzle-orm';
import {
	parseDailyEventType,
	parseDurationMinutes,
	parseLoggedAt,
	parseIdArray,
	exceedsLen
} from '$lib/server/validation';
import { MAX_NOTE_LEN } from '$lib/server/env';
import { logDailyEvent } from '$lib/server/daily-events';
import { failCareError } from '$lib/server/care-errors';

export const load: PageServerLoad = async ({ params }) => {
	// Companion existence is guaranteed by the (companion) layout (404s otherwise).
	const todayStart = new Date();
	todayStart.setHours(0, 0, 0, 0);

	const todayEvents = await db.query.dailyEvents.findMany({
		where: and(
			eq(schema.dailyEvents.companionId, params.companionId),
			gte(schema.dailyEvents.loggedAt, todayStart)
		),
		orderBy: (d, { desc }) => [desc(d.loggedAt)],
		with: { logger: { columns: { displayName: true } } }
	});

	return { todayEvents };
};

export const actions: Actions = {
	add: async ({ request, params, locals }) => {
		if (!locals.user) return fail(401, { error: t(locals.locale, 'error.unauthorized') });

		const data = await request.formData();
		const type = parseDailyEventType(String(data.get('type') ?? ''));
		const rawNotes = String(data.get('notes') ?? '');
		if (exceedsLen(rawNotes, MAX_NOTE_LEN))
			return fail(400, { error: t(locals.locale, 'error.noteTooLong', { max: MAX_NOTE_LEN }) });
		const notes = rawNotes.trim() || null;
		const durationMinutes = parseDurationMinutes(data.get('durationMinutes'));
		const loggedAt = parseLoggedAt(data.get('loggedAt')) ?? new Date();

		if (!type) return fail(400, { error: t(locals.locale, 'error.typeRequired') });

		const additionalIds = parseIdArray(data.getAll('additionalCompanionIds')).filter(
			(v) => v !== params.companionId
		);

		const result = await logDailyEvent(
			{ id: locals.user.id, role: locals.user.role },
			[params.companionId, ...additionalIds],
			{ type, notes, durationMinutes, loggedAt }
		);
		if (!result.ok) return failCareError(result.code, locals.locale, 'error');

		return { success: true };
	},

	delete: async ({ request, params, locals }) => {
		if (!locals.user) return fail(401, { error: t(locals.locale, 'error.unauthorized') });

		const data = await request.formData();
		const id = String(data.get('id') ?? '').trim();
		if (!id) return fail(400, { error: t(locals.locale, 'error.missingId') });

		const entry = await db.query.dailyEvents.findFirst({
			where: and(
				eq(schema.dailyEvents.id, id),
				eq(schema.dailyEvents.companionId, params.companionId)
			)
		});

		if (!entry) return fail(404, { error: t(locals.locale, 'error.entryNotFound') });
		// Members may delete their own entries; admins may delete any.
		if (locals.user.role !== 'admin' && entry.loggedBy !== locals.user.id)
			return fail(403, { error: t(locals.locale, 'error.canOnlyDeleteOwnEntries') });

		await db.delete(schema.dailyEvents).where(eq(schema.dailyEvents.id, id));

		return { success: true };
	}
};
