import { fail, type Action, type RequestEvent } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';
import { t, type Locale } from '#lib/i18n/index.js';
import { db, schema } from '#lib/server/db/index.js';
import { getMedication, logDose } from '#lib/server/medications.js';
import type { MedicationFormValues } from '#lib/medications.js';

type Locals = RequestEvent['locals'];

/**
 * Owner pages only: the route guard checks the group, this checks the role
 * and the companion. Actions run before the layout load that 404s an unknown
 * companion, and an archived companion is read-only.
 */
export async function ownerOnly(locals: Locals, companionId: string) {
	if (!locals.user) return fail(401, { error: t(locals.locale, 'error.unauthorized') });
	if (locals.user.role === 'caretaker')
		return fail(403, { error: t(locals.locale, 'error.forbidden') });
	const companion = await db.query.companions.findFirst({
		where: eq(schema.companions.id, companionId),
		columns: { isActive: true }
	});
	if (!companion) return fail(404, { error: t(locals.locale, 'error.companionNotFound') });
	if (!companion.isActive) return fail(403, { error: t(locals.locale, 'error.forbidden') });
	return null;
}

/** The form failure for a dose logDose refused, or null when it wrote one. */
export function doseRefusal(outcome: Awaited<ReturnType<typeof logDose>>, locale: Locale) {
	if (outcome === 'notFound') return fail(404, { error: t(locale, 'error.medicationNotFound') });
	if (outcome === 'ended') return fail(400, { error: t(locale, 'error.medicationEnded') });
	if (outcome === 'beforeStart')
		return fail(400, { error: t(locale, 'error.medicationNotStarted') });
	if (outcome === 'future') return fail(400, { error: t(locale, 'error.doseInFuture') });
	return null;
}

/** "Given" on the owner medication pages. logDose isn't companion-scoped, so check first. */
export const givenAction: Action<{ companionId: string }> = async ({ request, params, locals }) => {
	const denied = await ownerOnly(locals, params.companionId);
	if (denied) return denied;
	const data = await request.formData();
	const id = String(data.get('id') ?? '');
	const medication = id ? await getMedication(params.companionId, id) : undefined;
	if (!medication) return fail(404, { error: t(locals.locale, 'error.medicationNotFound') });
	const refused = doseRefusal(await logDose(medication.id, locals.user!), locals.locale);
	if (refused) return refused;
	return { doseLogged: medication.name };
};

/** What was typed, so a failed save re-renders the form with it. */
export function medicationFormValues(data: FormData): MedicationFormValues {
	const field = (name: string) => String(data.get(name) ?? '');
	return {
		name: field('name'),
		dose: field('dose'),
		instructions: field('instructions'),
		startedOn: field('startedOn'),
		endedOn: field('endedOn'),
		supplyId: field('supplyId'),
		doseUnits: field('doseUnits')
	};
}
