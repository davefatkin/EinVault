import { error, fail, redirect } from '@sveltejs/kit';
import { and, asc, eq, isNull } from 'drizzle-orm';
import type { Actions, PageServerLoad } from './$types';
import { t } from '#lib/i18n/index.js';
import { localDateISO } from '#lib/date.js';
import { db, schema } from '#lib/server/db/index.js';
import {
	deleteMedication,
	endMedication,
	listDoses,
	listMedicationSummaries,
	parseMedicationForm,
	restartMedication,
	updateMedication
} from '#lib/server/medications.js';
import { givenAction, medicationFormValues, ownerOnly } from '#lib/server/medication-actions.js';

const DOSE_PAGE = 50;
const MAX_DOSE_PAGES = 20;

export const load: PageServerLoad = async ({ params, locals, parent, url }) => {
	if (!locals.user) redirect(302, '/auth/login');
	if (locals.user.role === 'caretaker') redirect(302, '/care');
	const { companion } = await parent();
	const today = localDateISO();
	const medication = (
		await listMedicationSummaries([params.companionId], { activeOnly: false, today })
	).find((m) => m.id === params.id);
	if (!medication) error(404, t(locals.locale, 'error.medicationNotFound'));

	// "Show more" grows the history a page at a time.
	const pages = Math.min(
		Math.max(1, Math.floor(Number(url.searchParams.get('doses')) || 1)),
		MAX_DOSE_PAGES
	);
	const [doses, reminders] = await Promise.all([
		listDoses(medication.id, pages * DOSE_PAGE + 1),
		db.query.reminders.findMany({
			where: and(
				eq(schema.reminders.medicationId, medication.id),
				isNull(schema.reminders.completedAt)
			),
			orderBy: [asc(schema.reminders.dueAt), asc(schema.reminders.id)],
			columns: {
				id: true,
				dueAt: true,
				isRecurring: true,
				recurrenceUnit: true,
				recurrenceInterval: true,
				recurrenceAnchor: true,
				recurrenceAnchorValue: true
			}
		})
	]);
	return {
		companion,
		medication,
		reminders,
		doses: doses.slice(0, pages * DOSE_PAGE),
		// At the cap there is no next page, so "Show more" goes away.
		moreDoses: doses.length > pages * DOSE_PAGE && pages < MAX_DOSE_PAGES ? pages + 1 : null,
		editing: url.searchParams.get('edit') === '1',
		today
	};
};

export const actions: Actions = {
	update: async ({ request, params, locals }) => {
		const denied = ownerOnly(locals);
		if (denied) return denied;
		const data = await request.formData();
		const parsed = parseMedicationForm(data, locals.locale);
		if (!parsed.ok) return fail(400, { error: parsed.message, values: medicationFormValues(data) });
		if (!(await updateMedication(params.companionId, params.id, parsed.value)))
			return fail(404, { error: t(locals.locale, 'error.medicationNotFound') });
		redirect(303, `/${params.companionId}/medications/${params.id}`);
	},

	end: async ({ params, locals }) => {
		const denied = ownerOnly(locals);
		if (denied) return denied;
		if (!(await endMedication(params.companionId, params.id)))
			return fail(404, { error: t(locals.locale, 'error.medicationNotFound') });
		return { ended: true };
	},

	restart: async ({ params, locals }) => {
		const denied = ownerOnly(locals);
		if (denied) return denied;
		if (!(await restartMedication(params.companionId, params.id)))
			return fail(404, { error: t(locals.locale, 'error.medicationNotFound') });
		return { restarted: true };
	},

	delete: async ({ params, locals }) => {
		const denied = ownerOnly(locals);
		if (denied) return denied;
		if (!(await deleteMedication(params.companionId, params.id)))
			return fail(404, { error: t(locals.locale, 'error.medicationNotFound') });
		redirect(303, `/${params.companionId}/medications`);
	},

	given: givenAction
};
