import { fail, redirect } from '@sveltejs/kit';
import type { PageServerLoad, Actions } from './$types';
import { t } from '$lib/i18n';
import { db, schema } from '$lib/server/db';
import { eq, and } from 'drizzle-orm';
import { reminderPrefillUrl } from '$lib/health';
import { createHealthEvent, parseHealthEventForm } from '$lib/server/health';
import { createWeightEntry, parseWeightForm } from '$lib/server/weight';
import { getJournalDatesByEvent, deleteHealthEvent } from '$lib/server/journal-links';

export const load: PageServerLoad = async ({ params, locals, parent }) => {
	if (!locals.user) redirect(302, '/auth/login');
	const { companion } = await parent();

	const [healthEvents, weightEntries, linkedDocuments] = await Promise.all([
		db.query.healthEvents.findMany({
			where: eq(schema.healthEvents.companionId, params.companionId),
			orderBy: (h, { desc }) => [desc(h.occurredAt)],
			with: { logger: { columns: { displayName: true } } }
		}),
		db.query.weightEntries.findMany({
			where: eq(schema.weightEntries.companionId, params.companionId),
			orderBy: (w, { desc }) => [desc(w.recordedAt)],
			with: { logger: { columns: { displayName: true } } }
		}),
		db.query.documents.findMany({
			where: eq(schema.documents.companionId, params.companionId),
			columns: { id: true, title: true, healthEventId: true, filename: true, mimeType: true }
		})
	]);

	const journalDates = await getJournalDatesByEvent(
		params.companionId,
		healthEvents.map((e) => e.id)
	);
	const journalDatesByEvent = Object.fromEntries(journalDates);

	return { companion, healthEvents, weightEntries, linkedDocuments, journalDatesByEvent };
};

export const actions: Actions = {
	addHealth: async ({ request, params, locals }) => {
		if (!locals.user) return fail(401, { healthError: t(locals.locale, 'error.unauthorized') });
		const data = await request.formData();
		const parsed = parseHealthEventForm(data, locals.locale);
		if (!parsed.ok) return fail(400, { healthError: parsed.message });

		await createHealthEvent(params.companionId, parsed.value, locals.user.id);

		if (data.get('andReminder') === '1') {
			const { type, title, notes } = parsed.value;
			redirect(303, reminderPrefillUrl(params.companionId, type, title, notes));
		}
		return { healthSuccess: true };
	},

	addWeight: async ({ request, params, locals }) => {
		if (!locals.user) return fail(401, { weightError: t(locals.locale, 'error.unauthorized') });
		const data = await request.formData();
		const companion = await db.query.companions.findFirst({
			where: eq(schema.companions.id, params.companionId),
			columns: { weightUnit: true }
		});
		const parsed = parseWeightForm(data, companion?.weightUnit ?? 'lbs', locals.locale);
		if (!parsed.ok) return fail(400, { weightError: parsed.message });

		await createWeightEntry(params.companionId, parsed.value, locals.user.id);
		return { weightSuccess: true };
	},

	updateHealth: async ({ request, params, locals }) => {
		if (!locals.user) return fail(401, { healthError: t(locals.locale, 'error.unauthorized') });
		const data = await request.formData();
		const id = String(data.get('id') ?? '');
		if (!id) return fail(400, { healthError: t(locals.locale, 'error.missingId') });
		const parsed = parseHealthEventForm(data, locals.locale);
		if (!parsed.ok) return fail(400, { healthError: parsed.message });

		const existing = await db.query.healthEvents.findFirst({
			where: and(
				eq(schema.healthEvents.id, id),
				eq(schema.healthEvents.companionId, params.companionId)
			),
			columns: { id: true }
		});
		if (!existing) return fail(404, { healthError: t(locals.locale, 'error.eventNotFound') });

		await db.update(schema.healthEvents).set(parsed.value).where(eq(schema.healthEvents.id, id));

		return { updateHealthSuccess: true };
	},

	deleteHealth: async ({ request, params, locals }) => {
		if (!locals.user) return fail(401, { healthError: t(locals.locale, 'error.unauthorized') });
		const data = await request.formData();
		const id = String(data.get('id') ?? '');
		if (!id) return fail(400, { healthError: t(locals.locale, 'error.missingId') });

		const existing = await db.query.healthEvents.findFirst({
			where: and(
				eq(schema.healthEvents.id, id),
				eq(schema.healthEvents.companionId, params.companionId)
			),
			columns: { id: true }
		});
		if (!existing) return fail(404, { healthError: t(locals.locale, 'error.eventNotFound') });

		deleteHealthEvent(params.companionId, id);
		return { deleteHealthSuccess: true };
	},

	updateWeight: async ({ request, params, locals }) => {
		if (!locals.user) return fail(401, { weightError: t(locals.locale, 'error.unauthorized') });
		const data = await request.formData();
		const id = String(data.get('id') ?? '');
		if (!id) return fail(400, { weightError: t(locals.locale, 'error.missingId') });

		const existing = await db.query.weightEntries.findFirst({
			where: and(
				eq(schema.weightEntries.id, id),
				eq(schema.weightEntries.companionId, params.companionId)
			),
			columns: { id: true, unit: true }
		});
		if (!existing) return fail(404, { weightError: t(locals.locale, 'error.entryNotFound') });

		const parsed = parseWeightForm(data, existing.unit, locals.locale);
		if (!parsed.ok) return fail(400, { weightError: parsed.message });

		await db.update(schema.weightEntries).set(parsed.value).where(eq(schema.weightEntries.id, id));

		return { updateWeightSuccess: true };
	},

	deleteWeight: async ({ request, params, locals }) => {
		if (!locals.user) return fail(401, { weightError: t(locals.locale, 'error.unauthorized') });
		const data = await request.formData();
		const id = String(data.get('id') ?? '');
		if (!id) return fail(400, { weightError: t(locals.locale, 'error.missingId') });

		const existing = await db.query.weightEntries.findFirst({
			where: and(
				eq(schema.weightEntries.id, id),
				eq(schema.weightEntries.companionId, params.companionId)
			),
			columns: { id: true }
		});
		if (!existing) return fail(404, { weightError: t(locals.locale, 'error.entryNotFound') });

		await db.delete(schema.weightEntries).where(eq(schema.weightEntries.id, id));
		return { deleteWeightSuccess: true };
	}
};
