import { error } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';
import { t } from '#lib/i18n/index.js';
import { db, schema } from '#lib/server/db/index.js';
import { apiRoute } from '#lib/server/auth/api-request.js';
import { withIdempotency } from '#lib/server/api-idempotency.js';
import { throwCareError } from '#lib/server/care-errors.js';
import { authorizeCompanions, listAllowedCompanions } from '#lib/server/companion-scope.js';
import { logDose } from '#lib/server/medications.js';
import { MAX_NOTE_LEN } from '#lib/server/env.js';
import { parseLoggedAt } from '#lib/server/validation.js';
import { MedicationDoseRequest } from '#lib/server/openapi/schemas.js';

// POST /api/medications/{id}/doses: record that a dose was given. Body is
// optional: { givenAt?, note? }. Completes the matching linked reminder
// occurrence when there is one, else writes a standalone dose (see logDose). The token
// acts as its user, so a caretaker must be on shift and assigned. An id on a
// companion this token can't access reads as 404. Send an Idempotency-Key
// header to make a retry a no-op.
export const POST = apiRoute(async ({ event, user, tokenId, locale }) => {
	const id = event.params.id!;
	const medication = await db.query.medications.findFirst({
		where: eq(schema.medications.id, id),
		columns: { id: true, companionId: true }
	});
	const notFound = () => error(404, t(locale, 'error.medicationNotFound'), { code: 'notFound' });
	if (!medication) notFound();

	// Assignment-only gate first, so an off-shift caretaker can't tell unknown
	// ids from other companions' ids by the 403/404 split.
	const allowed = await listAllowedCompanions({ id: user.id, role: user.role });
	if (!allowed.includes(medication!.companionId)) notFound();
	const resolved = await authorizeCompanions({ id: user.id, role: user.role }, [
		medication!.companionId
	]);
	if (!resolved.ok) {
		if (resolved.code === 'notAssigned' || resolved.code === 'noTargets') notFound();
		throwCareError(resolved.code, locale);
	}

	// Body is optional: an empty body is {}. Anything else must be a JSON object
	// matching the strict schema (unknown fields and arrays are invalidBody).
	const text = (await event.request.text()).trim();
	let raw: unknown = null;
	if (text) {
		try {
			raw = JSON.parse(text);
		} catch {
			error(400, t(locale, 'error.invalidRequestBody'), { code: 'invalidBody' });
		}
	}
	const parsed = MedicationDoseRequest.strict().safeParse(raw ?? {});
	if (!parsed.success) {
		const issue = parsed.error.issues[0];
		if (issue?.path[0] === 'note' && issue.code === 'too_big')
			error(400, t(locale, 'error.noteTooLong', { max: MAX_NOTE_LEN }), { code: 'noteTooLong' });
		const where = issue?.path.join('.') || 'body';
		error(400, `${where}: ${issue?.message ?? t(locale, 'error.invalidRequestBody')}`, {
			code: 'invalidBody'
		});
	}
	let givenAt: Date | undefined;
	if (parsed.data.givenAt !== undefined) {
		givenAt = parseLoggedAt(parsed.data.givenAt) ?? undefined;
		if (!givenAt) error(400, t(locale, 'error.invalidDateTime'), { code: 'invalidGivenAt' });
	}
	const note = parsed.data.note?.trim() || undefined;

	return withIdempotency(
		{ request: event.request, tokenId, endpoint: `medications/${id}/doses`, body: raw },
		async () => {
			const result = await logDose(id, { id: user.id }, { givenAt, note });
			if (result === 'notFound') notFound();
			if (result === 'ended')
				error(409, t(locale, 'error.medicationEnded'), { code: 'medicationEnded' });
			if (result === 'beforeStart')
				error(400, t(locale, 'error.doseBeforeStart'), { code: 'givenBeforeStart' });
			if (result === 'future')
				error(400, t(locale, 'error.doseInFuture'), { code: 'givenInFuture' });
			if (typeof result === 'string') notFound();
			return { status: 201, data: result };
		}
	);
});
