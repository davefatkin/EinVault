import { redirect, error } from '@sveltejs/kit';
import type { LayoutServerLoad } from './$types';
import { db, schema } from '$lib/server/db';

export const load: LayoutServerLoad = async ({ locals, url }) => {
	const isApiRoute = url.pathname.startsWith('/api');
	if (isApiRoute) return {};

	const isSetupRoute = url.pathname.startsWith('/setup');

	// Guard: if DB tables don't exist yet, only allow the setup route to render the error
	let userCount;
	try {
		userCount = await db.$count(schema.users);
	} catch {
		// Tables not created yet; db:generate hasn't been run
		if (!isSetupRoute) {
			error(503, 'Database not initialised. Run `npm run db:generate` then restart the server.');
		}
		return {};
	}

	if (userCount === 0 && !isSetupRoute) {
		redirect(302, '/setup');
	}

	if (userCount > 0 && isSetupRoute) {
		redirect(302, '/');
	}

	return {
		user: locals.user,
		serverTimezone: Intl.DateTimeFormat().resolvedOptions().timeZone
	};
};
