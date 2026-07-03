import { error, json } from '@sveltejs/kit';
import { and, eq } from 'drizzle-orm';
import { t } from '$lib/i18n';
import { localDateISO } from '$lib/date';
import { db, schema } from '$lib/server/db';
import { apiRoute, apiRouteJson } from '$lib/server/auth/api-request';
import { withIdempotency } from '$lib/server/api-idempotency';
import { authorizeCompanions, listAllowedCompanions } from '$lib/server/companion-scope';
import { throwCareError } from '$lib/server/care-errors';
import { upsertJournalEntry } from '$lib/server/journal';
import { toApiJournalEntry } from '$lib/server/api-serializers';
import { isValidDate, parseMood, exceedsLen } from '$lib/server/validation';
import { MAX_JOURNAL_BODY_LEN } from '$lib/server/env';

// Read-back: GET /api/journal?companionId=&date=YYYY-MM-DD (date defaults to
// today). Returns the day's entry or { entry: null }.
export const GET = apiRoute(async ({ event, user, scope, locale }) => {
	// Write-only tokens (log-only devices) must not read back private journal text.
	if (scope === 'write') {
		error(403, { code: 'writeScopeReadOnly', message: t(locale, 'error.forbidden') });
	}
	const companionId = event.url.searchParams.get('companionId');
	if (!companionId) {
		error(400, { code: 'noCompanions', message: t(locale, 'error.noCompanionsSelected') });
	}
	const allowed = await listAllowedCompanions({ id: user.id, role: user.role });
	if (!allowed.includes(companionId)) throwCareError('notAssigned', locale);

	const date = event.url.searchParams.get('date') ?? localDateISO();
	if (!isValidDate(date))
		error(400, { code: 'invalidDate', message: t(locale, 'error.invalidDate') });

	const row = await db.query.journalEntries.findFirst({
		where: and(
			eq(schema.journalEntries.companionId, companionId),
			eq(schema.journalEntries.date, date)
		)
	});
	return json({ entry: row ? toApiJournalEntry(row) : null });
});

type JournalBody = { companionId: string; date?: unknown; body?: unknown; mood?: unknown };
const isJournalBody = (b: unknown): b is JournalBody =>
	typeof b === 'object' && b !== null && typeof (b as JournalBody).companionId === 'string';

// Bearer-token endpoint: write a journal entry. Body: { companionId, date?
// (YYYY-MM-DD, default today), body?, mood? }. NOTE: journal entries are
// unique per (companion, date); this REPLACES the day's body/mood, matching
// the web editor's upsert semantics. Devices appending discrete events should
// use POST /api/logs instead.
export const POST = apiRouteJson(isJournalBody, async ({ event, user, tokenId, locale, body }) => {
	const date = typeof body.date === 'string' ? body.date : localDateISO();
	if (!isValidDate(date))
		error(400, { code: 'invalidDate', message: t(locale, 'error.invalidDate') });

	// Caretakers may only write today's journal via the API, matching the web UI
	// (their editor is locked to the current day while on shift).
	if (user.role === 'caretaker' && date !== localDateISO()) {
		error(403, { code: 'forbidden', message: t(locale, 'error.forbidden') });
	}

	// A present-but-non-string body or mood is a client bug; reject it rather
	// than silently coercing to '' / null, which would wipe the stored value.
	if ('body' in body && typeof body.body !== 'string') {
		error(400, { code: 'invalidBody', message: t(locale, 'error.invalidBody') });
	}
	if ('mood' in body && typeof body.mood !== 'string') {
		error(400, { code: 'invalidBody', message: t(locale, 'error.invalidBody') });
	}

	// Absent body/mood keys preserve the stored value (partial update), so a
	// mood-only POST can't wipe the day's text and vice versa.
	const text = 'body' in body ? (body.body as string) : undefined;
	if (exceedsLen(text, MAX_JOURNAL_BODY_LEN)) {
		error(400, {
			code: 'journalTooLong',
			message: t(locale, 'error.journalTooLong', { max: MAX_JOURNAL_BODY_LEN })
		});
	}
	const mood = 'mood' in body ? parseMood(body.mood as string) : undefined;

	return withIdempotency(
		{ request: event.request, tokenId, endpoint: 'journal', body },
		async () => {
			const resolved = await authorizeCompanions({ id: user.id, role: user.role }, [
				body.companionId
			]);
			if (!resolved.ok) throwCareError(resolved.code, locale);
			const id = await upsertJournalEntry(body.companionId, date, text, mood, user.id);
			return { status: 201, data: { id, companionId: body.companionId, date } };
		}
	);
});
