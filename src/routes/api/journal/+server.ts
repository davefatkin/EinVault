import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { t } from '$lib/i18n';
import { localDateISO } from '$lib/date';
import { requireApiToken } from '$lib/server/auth/api-request';
import { authorizeCompanions } from '$lib/server/companion-scope';
import { upsertJournalEntry } from '$lib/server/journal';
import { isValidDate, parseMood } from '$lib/server/validation';

// Bearer-token endpoint: write a journal entry. Body: { companionId, date?
// (YYYY-MM-DD, default today), body?, mood? }. NOTE: journal entries are
// unique per (companion, date); this REPLACES the day's body/mood, matching
// the web editor's upsert semantics. Devices appending discrete events should
// use POST /api/logs instead.
export const POST: RequestHandler = async (event) => {
	const { user } = await requireApiToken(event);
	const locale = event.locals.locale;

	const body = await event.request.json().catch(() => null);
	if (!body || typeof body !== 'object' || typeof body.companionId !== 'string') {
		error(400, t(locale, 'error.invalidRequestBody'));
	}

	const date = typeof body.date === 'string' ? body.date : localDateISO();
	if (!isValidDate(date)) error(400, t(locale, 'error.invalidDate'));

	const mood = parseMood(typeof body.mood === 'string' ? body.mood : null);
	const text = typeof body.body === 'string' ? body.body : '';

	const resolved = await authorizeCompanions({ id: user.id, role: user.role }, [
		body.companionId
	]);
	if (!resolved.ok) {
		if (resolved.code === 'noActiveShift') error(403, t(locale, 'error.noActiveShift'));
		if (resolved.code === 'notAssigned') error(403, t(locale, 'error.notAssignedToCompanion'));
		error(404, t(locale, 'error.companionNotFound'));
	}

	await upsertJournalEntry(body.companionId, date, text, mood, user.id);
	return json({ companionId: body.companionId, date }, { status: 201 });
};
