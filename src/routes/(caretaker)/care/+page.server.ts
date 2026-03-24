import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ parent }) => {
	const { companions } = await parent();
	if (companions.length > 0) redirect(302, `/care/${companions[0].id}`);
	return {};
};
