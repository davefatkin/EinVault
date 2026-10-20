import { error, json } from '@sveltejs/kit';
import { and, eq } from 'drizzle-orm';
import { t } from '#lib/i18n/index.js';
import { localDateISO } from '#lib/date.js';
import { db, schema } from '#lib/server/db/index.js';
import { apiRoute, apiRouteZod } from '#lib/server/auth/api-request.js';
import { JournalRequest } from '#lib/server/openapi/schemas.js';
import { withIdempotency } from '#lib/server/api-idempotency.js';
import { authorizeCompanions, listAllowedCompanions } from '#lib/server/companion-scope.js';
import { throwCareError } from '#lib/server/care-errors.js';
import { upsertJournalEntry } from '#lib/server/journal.js';
import { toApiJournalEntry } from '#lib/server/api-serializers.js';
import { isValidDate, parseMood, exceedsLen } from '#lib/server/validation.js';
import { MAX_JOURNAL_BODY_LEN } from '#lib/server/env.js';

// Read-back: GET /api/journal?companionId=&date=YYYY-MM-DD (date defaults to
// today). Returns the day's entry or { entry: null }.
export const GET = apiRoute(async ({ event, user, scope, locale }) => {
	// Write-only tokens (log-only devices) must not read back private journal text.
	if (scope === 'write') {
		error(403, t(locale, 'error.forbidden'), { code: 'writeScopeReadOnly' });
	}
	const companionId = event.url.searchParams.get('companionId');
	if (!companionId) {
		error(400, t(locale, 'error.noCompanionsSelected'), { code: 'noCompanions' });
	}
	const allowed = await listAllowedCompanions({ id: user.id, role: user.role });
	if (!allowed.includes(companionId)) throwCareError('notAssigned', locale);

	const date = event.url.searchParams.get('date') ?? localDateISO();
	if (!isValidDate(date)) error(400, t(locale, 'error.invalidDate'), { code: 'invalidDate' });

	const row = await db.query.journalEntries.findFirst({
		where: and(
			eq(schema.journalEntries.companionId, companionId),
			eq(schema.journalEntries.date, date)
		)
	});
	return json({ entry: row ? toApiJournalEntry(row) : null });
});

// Bearer-token endpoint: upsert a journal entry. Body: { companionId, date?
// (YYYY-MM-DD, default today), body?, mood? }. Journal entries are unique per
// (companion, date); this REPLACES the day's body/mood, matching the web
// editor's upsert. Absent body/mood keys preserve the stored value (partial
// update), so a mood-only POST can't wipe the day's text and vice versa.
export const POST = apiRouteZod(
	JournalRequest,
	async ({ event, user, tokenId, locale, body }) => {
		const date = body.date ?? localDateISO();
		if (!isValidDate(date)) error(400, t(locale, 'error.invalidDate'), { code: 'invalidDate' });

		// Caretakers may only write today's journal via the API, matching the web UI.
		if (user.role === 'caretaker' && date !== localDateISO()) {
			error(403, t(locale, 'error.forbidden'), { code: 'forbidden' });
		}

		// Absent keys preserve the stored value (partial update). Zod has already
		// guaranteed that a PRESENT body is the right type and a PRESENT mood is a
		// member of the enum, so parseMood below can no longer observe an invalid value.
		const text = body.body;
		if (exceedsLen(text, MAX_JOURNAL_BODY_LEN)) {
			error(400, t(locale, 'error.journalTooLong', { max: MAX_JOURNAL_BODY_LEN }), {
				code: 'journalTooLong'
			});
		}
		const mood = body.mood !== undefined ? parseMood(body.mood) : undefined;

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
	},
	(issue, locale) => {
		// A wrong-type or unrecognized mood is a client bug: give it a stable,
		// field-specific code instead of the generic invalidBody.
		if (issue.path[0] === 'mood') {
			return { code: 'invalidMood', message: t(locale, 'error.invalidMood') };
		}
		return undefined; // body/companionId shape errors keep the documented invalidBody
	}
);
