import { error, type RequestEvent } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';
import { t } from '#lib/i18n/index.js';
import { localDateISO } from '#lib/date.js';
import { db, schema } from '#lib/server/db/index.js';
import { authorizeCompanions } from '#lib/server/companion-scope.js';
import { throwCareError, CARE_ERROR } from '#lib/server/care-errors.js';
import { getIncident, getIncidentUpdate, type IncidentRow } from '#lib/server/incidents.js';
import type { MessageKey } from '#lib/i18n/en.js';
import type { UserRole } from '#lib/server/validation.js';

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

// Note media writes (upload, Immich import, caption edit, delete, status poll).
// These endpoints live under /api/companions/..., outside every route group the
// hooks guard covers, so this check is their only protection (a missing check
// of this kind is what GHSA-m6gq-2wcm-93vv was). Members and admins may write
// any note's media, archived companions included, because notes stay editable
// in the owner UI. Caretakers never write note media. The note must belong to
// the companion in the URL; anything else is a 404 so ids can't be probed.
export async function assertCanWriteNoteMedia(
	locals: RequestEvent['locals'],
	companionId: string,
	noteId: string
): Promise<{ note: { id: string; companionId: string } }> {
	if (!locals.user) error(401, t(locals.locale, 'error.unauthorized'));
	if (locals.user.role === 'caretaker') error(403, t(locals.locale, 'error.forbidden'));
	const note = await db.query.notes.findFirst({
		where: eq(schema.notes.id, noteId),
		columns: { id: true, companionId: true }
	});
	if (!note || note.companionId !== companionId) {
		error(404, t(locals.locale, 'error.noteNotFound'));
	}
	return { note };
}

export type IncidentWriteAction =
	'overview' | 'resolve' | 'link' | 'delete' | 'addUpdate' | 'editUpdate' | 'media';

export type IncidentWriteCheck =
	{ ok: true; incident: IncidentRow } | { ok: false; status: 401 | 403 | 404; key: MessageKey };

const OWNER_ONLY: ReadonlySet<IncidentWriteAction> = new Set([
	'overview',
	'resolve',
	'link',
	'delete'
]);

const deny = (status: 401 | 403 | 404, key: MessageKey): IncidentWriteCheck => ({
	ok: false,
	status,
	key
});
const notFound = () => deny(404, 'error.incidentNotFound');
const forbidden = () => deny(403, 'error.forbidden');

// The single gate for incident writes (overview edit, resolve, links, delete,
// timeline updates, update and overview media). The incident routes and the
// media endpoints live partly outside the route-group guard's reach, which only
// checks role, so every caretaker write must pass through here (a missing check
// of this kind is what GHSA-m6gq-2wcm-93vv was). Non-throwing so form actions
// can map the result to fail(); assertCanWriteIncident wraps it for endpoints.
//
// Members and admins may do everything on any incident that belongs to the
// companion, archived companions included. Caretakers may only add updates,
// edit their own updates from today, and attach photos while logging: they need
// the shift + assignment + active-companion check, the incident must be open,
// and "today" is the server's local calendar date. Wrong ids are 404 so ids
// can't be probed.
export async function checkIncidentWrite(
	user: { id: string; role: UserRole } | null,
	companionId: string,
	incidentId: string,
	action: IncidentWriteAction,
	opts: { updateId?: string; now?: Date } = {}
): Promise<IncidentWriteCheck> {
	if (!user) return deny(401, 'error.unauthorized');
	const isCaretaker = user.role === 'caretaker';

	if (isCaretaker) {
		if (OWNER_ONLY.has(action)) return forbidden();
		const scope = await authorizeCompanions(user, [companionId]);
		if (!scope.ok) {
			const { status, key } = CARE_ERROR[scope.code];
			// A single companion id can only fail with 403 codes; fail closed on
			// anything else.
			return deny(status === 404 ? 404 : 403, key);
		}
	}

	const incident = await getIncident(companionId, incidentId);
	if (!incident) return notFound();
	if (isCaretaker && incident.resolvedAt) return notFound();

	const wantsUpdate = action === 'editUpdate' || (action === 'media' && !!opts.updateId);
	const update =
		wantsUpdate && opts.updateId ? await getIncidentUpdate(incident.id, opts.updateId) : undefined;
	if (wantsUpdate && opts.updateId && !update) return notFound();

	if (!isCaretaker) return { ok: true, incident };

	const today = localDateISO(opts.now ?? new Date());
	if (action === 'editUpdate' || (action === 'media' && opts.updateId)) {
		if (!update) return forbidden();
		if (update.loggedBy !== user.id || localDateISO(update.createdAt) !== today) {
			return forbidden();
		}
	} else if (action === 'media') {
		// Overview photos: only while the caretaker is logging the incident.
		if (incident.loggedBy !== user.id || localDateISO(incident.createdAt) !== today) {
			return forbidden();
		}
	}
	return { ok: true, incident };
}

export async function assertCanWriteIncident(
	locals: RequestEvent['locals'],
	companionId: string,
	incidentId: string,
	action: IncidentWriteAction,
	opts: { updateId?: string } = {}
): Promise<IncidentRow> {
	const res = await checkIncidentWrite(locals.user, companionId, incidentId, action, opts);
	if (!res.ok) error(res.status, t(locals.locale, res.key));
	return res.incident;
}
