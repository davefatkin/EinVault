import { fail } from '@sveltejs/kit';
import type { PageServerLoad, Actions } from './$types';
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

export const actions: Actions = {
	restore: async ({ request }) => {
		const data = await request.formData();
		const companionId = String(data.get('companionId') ?? '');
		if (!companionId) return fail(400);

		await db
			.update(schema.companions)
			.set({ isActive: true, archivedAt: null, archiveNote: null })
			.where(eq(schema.companions.id, companionId));

		return { restoreSuccess: true };
	}
};
