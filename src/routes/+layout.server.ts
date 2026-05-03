import { redirect, error } from '@sveltejs/kit';
import type { LayoutServerLoad } from './$types';
import { db, schema } from '$lib/server/db';
import { version } from '../../package.json';
import { t } from '$lib/i18n';
import { resolveReminderUndoSeconds } from '$lib/server/env';

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
			error(503, t(locals.locale, 'error.databaseNotInitialized'));
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
		locale: locals.locale,
		serverTimezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
		version,
		year: new Date().getFullYear(),
		reminderUndoSeconds: resolveReminderUndoSeconds(locals.user?.reminderUndoSeconds ?? null)
	};
};
