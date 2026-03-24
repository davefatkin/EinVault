import { error } from '@sveltejs/kit';
import type { LayoutServerLoad } from './$types';
import { db, schema } from '$lib/server/db';
import { eq } from 'drizzle-orm';

export const load: LayoutServerLoad = async ({ params }) => {
	const companion = await db.query.companions.findFirst({
		where: eq(schema.companions.id, params.companionId)
	});

	if (!companion) error(404, 'Companion not found');

	return { companion };
};
