import { fail, redirect } from '@sveltejs/kit';
import type { PageServerLoad, Actions } from './$types';
import { db, schema } from '$lib/server/db';
import { eq, and } from 'drizzle-orm';
import { generateId } from '$lib/server/utils';
import { parseHealthEventType, parseWeightUnit } from '$lib/server/validation';

export const load: PageServerLoad = async ({ params, locals, parent }) => {
	if (!locals.user) redirect(302, '/auth/login');
	const { companion } = await parent();

	const [healthEvents, weightEntries] = await Promise.all([
		db.query.healthEvents.findMany({
			where: eq(schema.healthEvents.companionId, params.companionId),
			orderBy: (h, { desc }) => [desc(h.occurredAt)]
		}),
		db.query.weightEntries.findMany({
			where: eq(schema.weightEntries.companionId, params.companionId),
			orderBy: (w, { desc }) => [desc(w.recordedAt)]
		})
	]);

	return { companion, healthEvents, weightEntries };
};

export const actions: Actions = {
	addHealth: async ({ request, params, locals }) => {
		if (!locals.user) return fail(401, { healthError: 'Unauthorized.' });
		const data = await request.formData();
		const title = String(data.get('title') ?? '').trim();
		const type = parseHealthEventType(String(data.get('type') ?? ''));
		const notes = String(data.get('notes') ?? '').trim() || null;
		const occurredAt = data.get('occurredAt')
			? new Date(String(data.get('occurredAt')))
			: new Date();
		const vetName = String(data.get('vetName') ?? '').trim() || null;
		const vetClinic = String(data.get('vetClinic') ?? '').trim() || null;
		const nextDueAtRaw = data.get('nextDueAt');
		const nextDueAt = nextDueAtRaw ? new Date(String(nextDueAtRaw)) : null;

		if (!title || !type) return fail(400, { healthError: 'Title and a valid type are required.' });

		await db.insert(schema.healthEvents).values({
			id: generateId(15),
			companionId: params.companionId,
			type,
			title,
			notes,
			occurredAt,
			nextDueAt,
			vetName,
			vetClinic
		});

		return { healthSuccess: true };
	},

	addWeight: async ({ request, params, locals }) => {
		if (!locals.user) return fail(401, { weightError: 'Unauthorized.' });
		const data = await request.formData();
		const weight = parseFloat(String(data.get('weight') ?? ''));
		const unit = parseWeightUnit(String(data.get('unit') ?? ''));
		const notes = String(data.get('notes') ?? '').trim() || null;
		const recordedAt = data.get('recordedAt')
			? new Date(String(data.get('recordedAt')))
			: new Date();

		if (isNaN(weight) || weight <= 0)
			return fail(400, { weightError: 'Valid weight is required.' });

		await db.insert(schema.weightEntries).values({
			id: generateId(15),
			companionId: params.companionId,
			weight,
			unit,
			notes,
			recordedAt
		});

		return { weightSuccess: true };
	},

	updateHealth: async ({ request, params, locals }) => {
		if (!locals.user) return fail(401, { healthError: 'Unauthorized.' });
		const data = await request.formData();
		const id = String(data.get('id') ?? '');
		const title = String(data.get('title') ?? '').trim();
		const type = parseHealthEventType(String(data.get('type') ?? ''));
		const notes = String(data.get('notes') ?? '').trim() || null;
		const occurredAt = data.get('occurredAt')
			? new Date(String(data.get('occurredAt')))
			: new Date();
		const vetName = String(data.get('vetName') ?? '').trim() || null;
		const vetClinic = String(data.get('vetClinic') ?? '').trim() || null;
		const nextDueAtRaw = data.get('nextDueAt');
		const nextDueAt = nextDueAtRaw ? new Date(String(nextDueAtRaw)) : null;

		if (!id) return fail(400, { healthError: 'Missing id.' });
		if (!title || !type) return fail(400, { healthError: 'Title and a valid type are required.' });

		const existing = await db.query.healthEvents.findFirst({
			where: and(
				eq(schema.healthEvents.id, id),
				eq(schema.healthEvents.companionId, params.companionId)
			),
			columns: { id: true }
		});
		if (!existing) return fail(404, { healthError: 'Event not found.' });

		await db
			.update(schema.healthEvents)
			.set({ type, title, notes, occurredAt, nextDueAt, vetName, vetClinic })
			.where(eq(schema.healthEvents.id, id));

		return { updateHealthSuccess: true };
	},

	deleteHealth: async ({ request, params, locals }) => {
		if (!locals.user) return fail(401, { healthError: 'Unauthorized.' });
		const data = await request.formData();
		const id = String(data.get('id') ?? '');
		if (!id) return fail(400, { healthError: 'Missing id.' });

		const existing = await db.query.healthEvents.findFirst({
			where: and(
				eq(schema.healthEvents.id, id),
				eq(schema.healthEvents.companionId, params.companionId)
			),
			columns: { id: true }
		});
		if (!existing) return fail(404, { healthError: 'Event not found.' });

		await db.delete(schema.healthEvents).where(eq(schema.healthEvents.id, id));
		return { deleteHealthSuccess: true };
	},

	updateWeight: async ({ request, params, locals }) => {
		if (!locals.user) return fail(401, { weightError: 'Unauthorized.' });
		const data = await request.formData();
		const id = String(data.get('id') ?? '');
		const weight = parseFloat(String(data.get('weight') ?? ''));
		const unit = parseWeightUnit(String(data.get('unit') ?? ''));
		const notes = String(data.get('notes') ?? '').trim() || null;
		const recordedAt = data.get('recordedAt')
			? new Date(String(data.get('recordedAt')))
			: new Date();

		if (!id) return fail(400, { weightError: 'Missing id.' });
		if (isNaN(weight) || weight <= 0)
			return fail(400, { weightError: 'Valid weight is required.' });

		const existing = await db.query.weightEntries.findFirst({
			where: and(
				eq(schema.weightEntries.id, id),
				eq(schema.weightEntries.companionId, params.companionId)
			),
			columns: { id: true }
		});
		if (!existing) return fail(404, { weightError: 'Entry not found.' });

		await db
			.update(schema.weightEntries)
			.set({ weight, unit, notes, recordedAt })
			.where(eq(schema.weightEntries.id, id));

		return { updateWeightSuccess: true };
	},

	deleteWeight: async ({ request, params, locals }) => {
		if (!locals.user) return fail(401, { weightError: 'Unauthorized.' });
		const data = await request.formData();
		const id = String(data.get('id') ?? '');
		if (!id) return fail(400, { weightError: 'Missing id.' });

		const existing = await db.query.weightEntries.findFirst({
			where: and(
				eq(schema.weightEntries.id, id),
				eq(schema.weightEntries.companionId, params.companionId)
			),
			columns: { id: true }
		});
		if (!existing) return fail(404, { weightError: 'Entry not found.' });

		await db.delete(schema.weightEntries).where(eq(schema.weightEntries.id, id));
		return { deleteWeightSuccess: true };
	}
};
