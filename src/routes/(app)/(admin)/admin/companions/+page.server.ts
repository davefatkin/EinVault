import { fail } from '@sveltejs/kit';
import type { PageServerLoad, Actions } from './$types';
import { db, schema } from '$lib/server/db';
import { eq } from 'drizzle-orm';
import { t } from '$lib/i18n';

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
	restore: async ({ request, locals }) => {
		// hooks.server.ts already rejects non-admin writes to (admin) routes; keep
		// an explicit check on the one action that had none.
		if (!locals.user) return fail(401, { error: t(locals.locale, 'error.unauthorized') });
		if (locals.user.role !== 'admin')
			return fail(403, { error: t(locals.locale, 'error.forbidden') });
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
