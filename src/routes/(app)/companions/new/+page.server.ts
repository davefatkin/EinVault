import { fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { db, schema } from '$lib/server/db';
import { generateId } from '$lib/server/utils';
import { parseSex, parseWeightUnit } from '$lib/server/validation';

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
		const weightUnit = parseWeightUnit(String(data.get('weightUnit') ?? ''));
		const microchip = String(data.get('microchip') ?? '').trim() || null;
		const bio = String(data.get('bio') ?? '').trim() || null;

		if (!name) {
			return fail(400, { error: 'Name is required.', name, breed, sex, dob, microchip, bio });
		}

		const id = generateId(15);

		await db.insert(schema.companions).values({
			id,
			name,
			breed,
			sex,
			dob,
			weightUnit,
			microchip,
			bio
		});

		redirect(302, `/${id}`);
	}
};
