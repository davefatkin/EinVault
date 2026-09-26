import { fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { t } from '$lib/i18n';
import { db, schema } from '$lib/server/db';
import { generateId } from '$lib/server/utils';
import { parseSex, parseSpecies, parseWeightUnitStrict } from '$lib/server/validation';
import { parseCompanionSpeciesAndUnit } from '$lib/server/companion-form';

export const load: PageServerLoad = async ({ locals }) => {
	if (!locals.user) redirect(302, '/auth/login');
	return {};
};

export const actions: Actions = {
	default: async ({ request, locals }) => {
		if (!locals.user) redirect(302, '/auth/login');
		if (locals.user.role === 'caretaker') redirect(302, '/care');

		const data = await request.formData();
		const name = String(data.get('name') ?? '').trim();
		const breed = String(data.get('breed') ?? '').trim() || null;
		const sex = parseSex(String(data.get('sex') ?? ''));
		const dob = String(data.get('dob') ?? '') || null;
		const microchip = String(data.get('microchip') ?? '').trim() || null;
		const bio = String(data.get('bio') ?? '').trim() || null;
		// Echoed on failure so the page restores the picker and unit select.
		const species = parseSpecies(String(data.get('species') ?? ''));
		const weightUnit = parseWeightUnitStrict(String(data.get('weightUnit') ?? ''));

		if (!name) {
			return fail(400, {
				error: t(locals.locale, 'error.nameRequired'),
				name,
				breed,
				sex,
				dob,
				microchip,
				bio,
				species,
				weightUnit
			});
		}

		const parsed = parseCompanionSpeciesAndUnit(data);
		if (!parsed.ok)
			return fail(400, {
				error: t(locals.locale, 'error.speciesRequired'),
				name,
				breed,
				sex,
				dob,
				microchip,
				bio,
				species,
				weightUnit
			});

		const id = generateId(15);

		await db.insert(schema.companions).values({
			id,
			name,
			species: parsed.species,
			breed,
			sex,
			dob,
			weightUnit: parsed.weightUnit,
			microchip,
			bio
		});

		redirect(302, `/${id}`);
	}
};
