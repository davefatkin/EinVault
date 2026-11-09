import { error } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';
import type { z } from 'zod';
import { t, type Locale } from '#lib/i18n/index.js';
import { db, schema } from '#lib/server/db/index.js';
import { listAllowedCompanions } from '#lib/server/companion-scope.js';
import type { UserRole } from '#lib/server/validation.js';
import { MAX_NOTE_LEN } from '#lib/textLimits.js';
import { getIncident, type IncidentRow } from '#lib/server/incidents.js';

// Shared guards for /api/health-events/{id}/(updates|links|resolve). The
// caller runs requireNoteOwnerScope first (full scope, no caretakers).

export function throwIncidentNotFound(locale: Locale): never {
	error(404, t(locale, 'error.incidentNotFound'), { code: 'notFound' });
}

// A missing id, a non-incident event, and an incident on a companion the token
// can't access (archived) all read as 404, so ids can't be probed.
export async function loadAllowedIncident(
	id: string,
	user: { id: string; role: UserRole },
	locale: Locale
): Promise<IncidentRow> {
	const ev = await db.query.healthEvents.findFirst({
		where: eq(schema.healthEvents.id, id),
		columns: { companionId: true }
	});
	const allowed = ev && (await listAllowedCompanions(user)).includes(ev.companionId);
	const incident = allowed ? await getIncident(ev.companionId, id) : undefined;
	if (!incident) throwIncidentNotFound(locale);
	return incident;
}

// Maps zod shape failures on the incident update bodies to stable codes.
export function incidentUpdateCodeFor(
	issue: z.core.$ZodIssue,
	locale: Locale
): { code: string; message: string } | undefined {
	const field = issue.path[0];
	if (field === 'body' && issue.code === 'too_big')
		return { code: 'bodyTooLong', message: t(locale, 'error.fieldTooLong', { max: MAX_NOTE_LEN }) };
	if (field === 'body' && (issue.code === 'too_small' || issue.code === 'invalid_type'))
		return { code: 'bodyRequired', message: t(locale, 'error.updateBodyRequired') };
	if (field === 'severity')
		return { code: 'invalidSeverity', message: t(locale, 'error.invalidSeverity') };
	return undefined;
}

export function throwUpdateNotFound(locale: Locale): never {
	error(404, t(locale, 'error.updateNotFound'), { code: 'notFound' });
}
