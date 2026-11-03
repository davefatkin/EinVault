import { redirect, error } from '@sveltejs/kit';
import type { LayoutServerLoad } from './$types';
import { db, schema } from '#lib/server/db/index.js';
import { version } from '../../package.json';
import { localDateISO } from '#lib/date.js';
import { t } from '#lib/i18n/index.js';
import { resolveReminderUndoSeconds, DEMO_MODE } from '#lib/server/env.js';
import { isImmichEnabled, isPaperlessEnabled } from '#lib/server/storage/index.js';

export const load: LayoutServerLoad = async ({ locals, url, cookies }) => {
	// Server-computed "today" (app timezone) so client links and age math match
	// the server's notion of today, never the browser clock.
	const today = localDateISO();
	const isApiRoute = url.pathname.startsWith('/api');
	if (isApiRoute) return { today };

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
		return { today };
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
		today,
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
