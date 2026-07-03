import { json, error } from '@sveltejs/kit';
import { t } from '$lib/i18n';
import { localDateISO } from '$lib/date';
import { apiRouteJson } from '$lib/server/auth/api-request';
import { authorizeCompanions } from '$lib/server/companion-scope';
import { throwCareError } from '$lib/server/care-errors';
import { upsertJournalEntry } from '$lib/server/journal';
import { isValidDate, parseMood } from '$lib/server/validation';

type JournalBody = { companionId: string; date?: unknown; body?: unknown; mood?: unknown };
const isJournalBody = (b: unknown): b is JournalBody =>
	typeof b === 'object' && b !== null && typeof (b as JournalBody).companionId === 'string';

// Bearer-token endpoint: write a journal entry. Body: { companionId, date?
// (YYYY-MM-DD, default today), body?, mood? }. NOTE: journal entries are
// unique per (companion, date); this REPLACES the day's body/mood, matching
// the web editor's upsert semantics. Devices appending discrete events should
// use POST /api/logs instead.
export const POST = apiRouteJson(isJournalBody, async ({ user, locale, body }) => {
	const date = typeof body.date === 'string' ? body.date : localDateISO();
	if (!isValidDate(date)) error(400, { code: 'invalidDate', message: t(locale, 'error.invalidDate') });

	const mood = parseMood(typeof body.mood === 'string' ? body.mood : null);
	const text = typeof body.body === 'string' ? body.body : '';

	const resolved = await authorizeCompanions({ id: user.id, role: user.role }, [body.companionId]);
	if (!resolved.ok) throwCareError(resolved.code, locale);

	await upsertJournalEntry(body.companionId, date, text, mood, user.id);
	return json({ companionId: body.companionId, date }, { status: 201 });
});
