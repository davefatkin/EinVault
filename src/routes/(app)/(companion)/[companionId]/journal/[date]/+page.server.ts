import { error, fail, redirect } from '@sveltejs/kit';
import type { PageServerLoad, Actions } from './$types';
import { t } from '#lib/i18n/index.js';
import { db, schema } from '#lib/server/db/index.js';
import { eq, and, gte, lt, inArray } from 'drizzle-orm';
import { generateId } from '#lib/server/utils.js';
import {
	parseMood,
	parseDailyEventType,
	isValidDate,
	parseIdArray,
	parseDurationMinutes,
	parseLoggedAt,
	exceedsLen
} from '#lib/server/validation.js';
import { localDateISO } from '#lib/date.js';
import { toMediaItem } from '#lib/media.js';
import { upsertJournalEntry } from '#lib/server/journal.js';
import { MEDIA_ITEM_COLUMNS, WITH_LOGGER } from '#lib/server/media-columns.js';
import { checkSpeciesAndNarrow } from '#lib/server/daily-events.js';
import { failCareError } from '#lib/server/care-errors.js';
import { resolveActivityUpdate } from '#lib/server/journal-activity.js';
import { getDayItems, listAttachableDocuments } from '#lib/server/journal-day-items.js';
import { createHealthEvent, parseHealthEventForm } from '#lib/server/health.js';
import { createWeightEntry, parseWeightForm } from '#lib/server/weight.js';
import { reminderPrefillUrl } from '#lib/health.js';
import {
	listLinkableHealthEvents,
	linkHealthEvent,
	unlinkHealthEvent
} from '#lib/server/journal-links.js';
import {
	MAX_DAILY_MEDIA,
	UPLOAD_MAX_MB,
	VIDEO_MAX_MB,
	MAX_NOTE_LEN,
	MAX_JOURNAL_BODY_LEN
} from '#lib/server/env.js';

export const load: PageServerLoad = async ({ params, locals, parent }) => {
	if (!locals.user) redirect(302, '/auth/login');
	const { companionId, date } = params;

	if (!isValidDate(date)) error(400, t(locals.locale, 'error.invalidDate'));

	const { companion } = await parent();

	const entry = await db.query.journalEntries.findFirst({
		where: and(
			eq(schema.journalEntries.companionId, companionId),
			eq(schema.journalEntries.date, date)
		),
		with: {
			logger: { columns: { displayName: true } },
			updater: { columns: { displayName: true } }
		}
	});

	// Load media for this date. Only the fields the UI needs, so storage keys
	// and transcode bookkeeping never reach the browser.
	const media = entry
		? await db.query.media.findMany({
				where: eq(schema.media.entryId, entry.id),
				orderBy: (p, { asc }) => [asc(p.createdAt)],
				columns: MEDIA_ITEM_COLUMNS,
				with: WITH_LOGGER
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
		orderBy: (d, { desc }) => [desc(d.loggedAt), desc(d.createdAt)],
		with: { logger: { columns: { displayName: true } } }
	});

	const dayItems = (await getDayItems(companionId, { from: date, to: date })).get(date) ?? [];

	const linkableHealthEvents =
		companion.isActive === false
			? []
			: await listLinkableHealthEvents(companionId, date, entry?.id ?? null);

	const attachableDocuments =
		companion.isActive === false ? [] : await listAttachableDocuments(companionId);

	const today = localDateISO();

	return {
		companion,
		entry: entry ?? null,
		photos: media.map(toMediaItem),
		recentEntries,
		dailyEvents,
		dayItems,
		linkableHealthEvents,
		attachableDocuments,
		date,
		today,
		isToday: date === today,
		uploadMaxMb: UPLOAD_MAX_MB,
		videoMaxMb: VIDEO_MAX_MB,
		maxDailyMedia: MAX_DAILY_MEDIA
	};
};

async function isArchived(companionId: string): Promise<boolean> {
	const row = await db.query.companions.findFirst({
		where: eq(schema.companions.id, companionId),
		columns: { isActive: true }
	});
	return !row || row.isActive === false;
}

export const actions: Actions = {
	save: async ({ params, request, locals }) => {
		if (!locals.user) return fail(401, { error: t(locals.locale, 'error.unauthorized') });
		const { companionId, date } = params;
		if (!isValidDate(date)) return fail(400, { error: t(locals.locale, 'error.invalidDate') });

		const data = await request.formData();
		const body = String(data.get('body') ?? '');
		if (exceedsLen(body, MAX_JOURNAL_BODY_LEN))
			return fail(400, {
				error: t(locals.locale, 'error.journalTooLong', { max: MAX_JOURNAL_BODY_LEN })
			});
		const moodValue = parseMood(data.get('mood') as string | null);

		await upsertJournalEntry(companionId, date, body, moodValue, locals.user.id);

		return { success: true };
	},

	addActivity: async ({ params, request, locals }) => {
		if (!locals.user) return fail(401, { error: t(locals.locale, 'error.unauthorized') });
		if (locals.user.role === 'caretaker')
			return fail(403, { error: t(locals.locale, 'error.forbidden') });
		const { companionId, date } = params;
		if (!isValidDate(date)) return fail(400, { error: t(locals.locale, 'error.invalidDate') });

		const data = await request.formData();
		const type = parseDailyEventType(String(data.get('type') ?? ''));
		const rawNotes = String(data.get('notes') ?? '');
		if (exceedsLen(rawNotes, MAX_NOTE_LEN))
			return fail(400, { error: t(locals.locale, 'error.noteTooLong', { max: MAX_NOTE_LEN }) });
		const notes = rawNotes.trim() || null;
		const durationMinutes = parseDurationMinutes(data.get('durationMinutes'));
		const loggedAt = parseLoggedAt(data.get('loggedAt')) ?? new Date();

		if (!type) return fail(400, { error: t(locals.locale, 'error.eventTypeRequired') });

		// The primary companion always gets a row, even if archived: this page
		// backfills entries for a companion's own journal, which stays reachable
		// after the companion is archived. Only additional (tagged) companions
		// are active-filtered, same as before species existed.
		const additionalIds = parseIdArray(data.getAll('additionalCompanionIds')).filter(
			(v) => v !== companionId
		);
		let validAdditionalIds: string[] = [];
		if (additionalIds.length > 0) {
			const rows = await db.query.companions.findMany({
				where: and(
					inArray(schema.companions.id, additionalIds),
					eq(schema.companions.isActive, true)
				),
				columns: { id: true }
			});
			validAdditionalIds = rows.map((r) => r.id);
		}

		const targetIds = [companionId, ...validAdditionalIds];
		const checked = await checkSpeciesAndNarrow(
			targetIds,
			type,
			data.getAll('subtypes').map(String)
		);
		if (!checked.ok) return failCareError(checked.code, locals.locale, 'error');

		const eventGroupId = targetIds.length > 1 ? generateId(15) : null;
		const values = targetIds.map((cid) => ({
			id: generateId(15),
			companionId: cid,
			type,
			notes,
			durationMinutes,
			loggedAt,
			subtypes: checked.subtypesById.get(cid) ?? null,
			loggedBy: locals.user!.id,
			eventGroupId
		}));

		await db.insert(schema.dailyEvents).values(values);

		return { addSuccess: true };
	},

	updateActivity: async ({ request, params, locals }) => {
		if (!locals.user) return fail(401, { error: t(locals.locale, 'error.unauthorized') });
		if (locals.user.role === 'caretaker')
			return fail(403, { error: t(locals.locale, 'error.forbidden') });
		const { companionId } = params;
		const data = await request.formData();
		const id = String(data.get('id') ?? '');
		const type = parseDailyEventType(String(data.get('type') ?? ''));
		const rawNotes = String(data.get('notes') ?? '');
		if (exceedsLen(rawNotes, MAX_NOTE_LEN))
			return fail(400, { error: t(locals.locale, 'error.noteTooLong', { max: MAX_NOTE_LEN }) });
		const notes = rawNotes.trim() || null;
		const durationMinutes = parseDurationMinutes(data.get('durationMinutes'));
		const loggedAt = parseLoggedAt(data.get('loggedAt')) ?? new Date();

		if (!id) return fail(400, { error: t(locals.locale, 'error.missingId') });
		if (!type) return fail(400, { error: t(locals.locale, 'error.eventTypeRequired') });

		const resolved = await resolveActivityUpdate(companionId, id, type, data.getAll('subtypes'));
		if (!resolved.ok)
			return resolved.code === 'notFound'
				? fail(404, { error: t(locals.locale, 'error.eventNotFound') })
				: fail(400, { error: t(locals.locale, 'error.typeNotAllowedForSpecies') });

		await db
			.update(schema.dailyEvents)
			.set({ type, notes, durationMinutes, loggedAt, subtypes: resolved.subtypes })
			.where(eq(schema.dailyEvents.id, id));

		return { updateActivitySuccess: true };
	},

	deleteActivity: async ({ request, params, locals }) => {
		if (!locals.user) return fail(401, { error: t(locals.locale, 'error.unauthorized') });
		if (locals.user.role === 'caretaker')
			return fail(403, { error: t(locals.locale, 'error.forbidden') });
		const { companionId } = params;
		const data = await request.formData();
		const id = String(data.get('id') ?? '');
		if (!id) return fail(400, { error: t(locals.locale, 'error.missingId') });

		const existing = await db.query.dailyEvents.findFirst({
			where: and(eq(schema.dailyEvents.id, id), eq(schema.dailyEvents.companionId, companionId)),
			columns: { id: true }
		});
		if (!existing) return fail(404, { error: t(locals.locale, 'error.eventNotFound') });

		await db.delete(schema.dailyEvents).where(eq(schema.dailyEvents.id, id));
		return { deleteActivitySuccess: true };
	},

	linkHealth: async ({ params, request, locals }) => {
		if (!locals.user) return fail(401, { linkError: t(locals.locale, 'error.unauthorized') });
		const { companionId, date } = params;
		if (!isValidDate(date)) return fail(400, { linkError: t(locals.locale, 'error.invalidDate') });
		if (await isArchived(companionId))
			return fail(403, { linkError: t(locals.locale, 'error.forbidden') });
		const healthEventId = String((await request.formData()).get('healthEventId') ?? '');
		const result = await linkHealthEvent(companionId, date, healthEventId, locals.user.id);
		if (result === 'notFound')
			return fail(404, { linkError: t(locals.locale, 'error.eventNotFound') });
		if (result === 'sameDay')
			return fail(400, { linkError: t(locals.locale, 'error.sameDayLink') });
		return { linkSuccess: true };
	},

	unlinkHealth: async ({ params, request, locals }) => {
		if (!locals.user) return fail(401, { unlinkError: t(locals.locale, 'error.unauthorized') });
		const { companionId, date } = params;
		if (!isValidDate(date))
			return fail(400, { unlinkError: t(locals.locale, 'error.invalidDate') });
		if (await isArchived(companionId))
			return fail(403, { unlinkError: t(locals.locale, 'error.forbidden') });
		const healthEventId = String((await request.formData()).get('healthEventId') ?? '');
		unlinkHealthEvent(companionId, date, healthEventId);
		return { unlinkSuccess: true };
	},

	addHealth: async ({ params, request, locals }) => {
		if (!locals.user) return fail(401, { healthError: t(locals.locale, 'error.unauthorized') });
		const { companionId, date } = params;
		if (!isValidDate(date))
			return fail(400, { healthError: t(locals.locale, 'error.invalidDate') });
		if (await isArchived(companionId))
			return fail(403, { healthError: t(locals.locale, 'error.forbidden') });

		const data = await request.formData();
		const parsed = parseHealthEventForm(data, locals.locale);
		if (!parsed.ok) return fail(400, { healthError: parsed.message });

		const healthEventId = await createHealthEvent(companionId, parsed.value, locals.user.id);
		// Saved onto another day: link it here, so it still shows on this page.
		const day = localDateISO(parsed.value.occurredAt);
		if (day !== date) await linkHealthEvent(companionId, date, healthEventId, locals.user.id);

		const { type, title, notes } = parsed.value;
		const reminderUrl =
			data.get('andReminder') === '1' ? reminderPrefillUrl(companionId, type, title, notes) : null;
		return { healthEventId, day, reminderUrl };
	},

	addWeight: async ({ params, request, locals }) => {
		if (!locals.user) return fail(401, { weightError: t(locals.locale, 'error.unauthorized') });
		const { companionId, date } = params;
		if (!isValidDate(date))
			return fail(400, { weightError: t(locals.locale, 'error.invalidDate') });
		if (await isArchived(companionId))
			return fail(403, { weightError: t(locals.locale, 'error.forbidden') });

		const companion = await db.query.companions.findFirst({
			where: eq(schema.companions.id, companionId),
			columns: { weightUnit: true }
		});
		const parsed = parseWeightForm(
			await request.formData(),
			companion?.weightUnit ?? 'lbs',
			locals.locale
		);
		if (!parsed.ok) return fail(400, { weightError: parsed.message });

		await createWeightEntry(companionId, parsed.value, locals.user.id);
		return { weightSuccess: true };
	}
};
