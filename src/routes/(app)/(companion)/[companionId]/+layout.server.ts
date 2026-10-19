import { error } from '@sveltejs/kit';
import type { LayoutServerLoad } from './$types';
import { db, schema } from '#lib/server/db/index.js';
import { eq } from 'drizzle-orm';
import { t } from '#lib/i18n/index.js';

export const load: LayoutServerLoad = async ({ params, locals }) => {
	const companion = await db.query.companions.findFirst({
		where: eq(schema.companions.id, params.companionId)
	});

	if (!companion) error(404, t(locals.locale, 'error.companionNotFound'));

	return { companion };
};
