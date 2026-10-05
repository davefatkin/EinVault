import { error, type RequestEvent } from '@sveltejs/kit';
import { t } from '$lib/i18n';
import { localDateISO } from '$lib/date';
import { authorizeCompanions } from '$lib/server/companion-scope';
import { throwCareError } from '$lib/server/care-errors';

// Journal media writes (upload, caption edit, delete). Members and admins may
// write for any companion. Caretakers follow the care journal rules: an active
// shift and an assignment to the companion, and when `date` is given (uploads),
// only today's date. Throws via SvelteKit's error() helper on failure; returns
// void on success.
export async function assertCanWriteJournalMedia(
	locals: RequestEvent['locals'],
	companionId: string,
	date?: string
): Promise<void> {
	if (!locals.user) error(401, t(locals.locale, 'error.unauthorized'));
	if (locals.user.role !== 'caretaker') return;
	const scope = await authorizeCompanions(locals.user, [companionId]);
	if (!scope.ok) throwCareError(scope.code, locals.locale);
	if (date !== undefined && date !== localDateISO()) {
		error(403, t(locals.locale, 'error.forbidden'));
	}
}
