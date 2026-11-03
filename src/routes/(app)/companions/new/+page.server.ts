import { fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { t } from '#lib/i18n/index.js';
import { db, schema } from '#lib/server/db/index.js';
import { generateId } from '#lib/server/utils.js';
import { parseSex, parseSpecies, parseWeightUnitStrict } from '#lib/server/validation.js';
import { localDateISO } from '#lib/date.js';
import { parseCompanionDates, parseCompanionSpeciesAndUnit } from '#lib/server/companion-form.js';

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
		const dob = String(data.get('dob') ?? '').trim() || null;
		const dobApproximate = data.has('dobApproximate');
		const homecomingDate = String(data.get('homecomingDate') ?? '').trim() || null;
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
				dobApproximate,
				homecomingDate,
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
				dobApproximate,
				homecomingDate,
				microchip,
				bio,
				species,
				weightUnit
			});

		const dates = parseCompanionDates(data, localDateISO());
		if (!dates.ok)
			return fail(400, {
				error: t(
					locals.locale,
					dates.error === 'invalidDob' ? 'error.invalidDob' : 'error.invalidHomecoming'
				),
				name,
				breed,
				sex,
				dob,
				dobApproximate,
				homecomingDate,
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
			dob: dates.dob,
			dobApproximate: dates.dobApproximate,
			homecomingDate: dates.homecomingDate,
			weightUnit: parsed.weightUnit,
			microchip,
			bio
		});

		redirect(302, `/${id}`);
	}
};
