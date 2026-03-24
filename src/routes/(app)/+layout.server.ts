import { redirect } from '@sveltejs/kit';
import type { LayoutServerLoad } from './$types';
import { db, schema } from '$lib/server/db';
import { eq } from 'drizzle-orm';

export const load: LayoutServerLoad = async ({ locals }) => {
	if (!locals.user) {
		redirect(302, '/auth/login');
	}

	// Caretakers have their own layout: boot them to /care
	if (locals.user.role === 'caretaker') {
		redirect(302, '/care');
	}

	const [companions, archivedCompanions] = await Promise.all([
		db.query.companions.findMany({
			where: eq(schema.companions.isActive, true),
			orderBy: (c, { asc }) => [asc(c.name)]
		}),
		db.query.companions.findMany({
			where: eq(schema.companions.isActive, false),
			orderBy: (c, { desc }) => [desc(c.archivedAt)]
		})
	]);

	return {
		user: locals.user,
		companions,
		archivedCompanions
	};
};
