import { redirect, error } from '@sveltejs/kit';
import type { LayoutServerLoad } from './$types';
import { db, schema } from '$lib/server/db';
import { version } from '../../package.json';
import { t } from '$lib/i18n';
import { resolveReminderUndoSeconds, DEMO_MODE } from '$lib/server/env';
import { isImmichEnabled, isPaperlessEnabled } from '$lib/server/storage';

export const load: LayoutServerLoad = async ({ locals, url, cookies }) => {
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

	const demoNotice = DEMO_MODE && cookies.get('einvault_demo_notice') === '1';
	if (demoNotice) {
		cookies.delete('einvault_demo_notice', { path: '/' });
	}

	return {
		user: locals.user,
		locale: locals.locale,
		serverTimezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
		// Don't leak the running version on the public demo; footer falls back to
		// the source-code link.
		version: DEMO_MODE ? undefined : version,
		year: new Date().getFullYear(),
		reminderUndoSeconds: resolveReminderUndoSeconds(locals.user?.reminderUndoSeconds ?? null),
		// Caretakers don't get the picker — the underlying endpoints reject them.
		immichEnabled: isImmichEnabled() && locals.user?.role !== 'caretaker',
		paperlessEnabled: isPaperlessEnabled() && locals.user?.role !== 'caretaker',
		demoMode: DEMO_MODE,
		demoNotice
	};
};
