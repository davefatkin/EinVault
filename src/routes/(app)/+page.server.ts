import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { db, schema } from '$lib/server/db';
import { eq } from 'drizzle-orm';

export const load: PageServerLoad = async ({ locals }) => {
	if (!locals.user) redirect(302, '/auth/login');

	const first = await db.query.companions.findFirst({
		where: eq(schema.companions.isActive, true),
		orderBy: (c, { asc }) => [asc(c.name)]
	});

	if (first) {
		redirect(302, `/${first.id}`);
	} else {
		redirect(302, '/companions/new');
	}
};
