import { error, fail, redirect } from '@sveltejs/kit';
import type { PageServerLoad, Actions } from './$types';
import { t } from '$lib/i18n';
import { db, schema } from '$lib/server/db';
import { eq } from 'drizzle-orm';
import { parseSex, parseWeightUnit } from '$lib/server/validation';

export const load: PageServerLoad = async ({ params, locals }) => {
	if (!locals.user) redirect(302, '/auth/login');
	if (locals.user.role === 'caretaker') redirect(302, '/care');

	const companion = await db.query.companions.findFirst({
		where: eq(schema.companions.id, params.id)
	});
	if (!companion) error(404, t(locals.locale, 'error.companionNotFound'));

	return { companion, user: locals.user };
};

export const actions: Actions = {
	save: async ({ request, params, locals }) => {
		if (!locals.user) redirect(302, '/auth/login');
		if (locals.user.role === 'caretaker') redirect(302, '/care');

		const companion = await db.query.companions.findFirst({
			where: eq(schema.companions.id, params.id)
		});
		if (!companion) error(404, t(locals.locale, 'error.companionNotFound'));

		const data = await request.formData();
		const name = String(data.get('name') ?? '').trim();

		if (!name) return fail(400, { error: t(locals.locale, 'error.nameRequired') });

		await db
			.update(schema.companions)
			.set({
				name,
				breed: String(data.get('breed') ?? '').trim() || null,
				sex: parseSex(String(data.get('sex') ?? '')),
				dob: String(data.get('dob') ?? '') || null,
				weightUnit: parseWeightUnit(String(data.get('weightUnit') ?? '')),
				microchip: String(data.get('microchip') ?? '').trim() || null,
				bio: String(data.get('bio') ?? '').trim() || null,
				// Caretaker fields
				feedingSchedule: String(data.get('feedingSchedule') ?? '').trim() || null,
				walkSchedule: String(data.get('walkSchedule') ?? '').trim() || null,
				emergencyContactName: String(data.get('emergencyContactName') ?? '').trim() || null,
				emergencyContactPhone: String(data.get('emergencyContactPhone') ?? '').trim() || null,
				vetName: String(data.get('vetName') ?? '').trim() || null,
				vetPhone: String(data.get('vetPhone') ?? '').trim() || null,
				vetClinic: String(data.get('vetClinic') ?? '').trim() || null,
				notesForSitter: String(data.get('notesForSitter') ?? '').trim() || null
			})
			.where(eq(schema.companions.id, params.id));

		return { success: true };
	},

	archive: async ({ request, params, locals }) => {
		if (locals.user?.role !== 'admin') error(403, t(locals.locale, 'error.forbidden'));

		const data = await request.formData();
		const archivedAt = String(data.get('archivedAt') ?? '').trim();
		const archiveNote = String(data.get('archiveNote') ?? '').trim();

		const archivedAtDate = archivedAt ? new Date(archivedAt) : new Date();
		if (isNaN(archivedAtDate.getTime()))
			return fail(400, { error: t(locals.locale, 'error.invalidArchiveDate') });

		await db
			.update(schema.companions)
			.set({
				isActive: false,
				archivedAt: archivedAtDate,
				archiveNote: archiveNote || null
			})
			.where(eq(schema.companions.id, params.id));

		redirect(302, '/settings');
	}
};
