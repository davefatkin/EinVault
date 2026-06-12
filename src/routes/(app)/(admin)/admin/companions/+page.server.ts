import type { PageServerLoad } from './$types';
import { db, schema } from '$lib/server/db';
import { eq } from 'drizzle-orm';

export const load: PageServerLoad = async () => {
	const companions = await db.query.companions.findMany({
		where: eq(schema.companions.isActive, true),
		orderBy: (c, { asc }) => [asc(c.name)]
	});

	const archivedCompanions = await db.query.companions.findMany({
		where: eq(schema.companions.isActive, false),
		orderBy: (c, { desc }) => [desc(c.archivedAt)]
	});

	return { companions, archivedCompanions };
};
