import { db, schema } from '#lib/server/db/index.js';
import { generateId } from '#lib/server/utils.js';
import { t, type Locale } from '#lib/i18n/index.js';
import { MAX_NOTE_LEN } from '#lib/textLimits.js';
import {
	exceedsLen,
	parseFormTimestamp,
	parseHealthEventType,
	type FormParse,
	type HealthEventType
} from '#lib/server/validation.js';

export interface HealthEventInput {
	type: HealthEventType;
	title: string;
	notes: string | null;
	occurredAt: Date;
	vetName: string | null;
	vetClinic: string | null;
}

// Pure insert: one health_events row. Scope/permission checks are the caller's
// responsibility (the form enforces access via the companion layout; the API
// route calls authorizeCompanions), so both write paths share this one insert.
export async function createHealthEvent(
	companionId: string,
	input: HealthEventInput,
	loggedBy: string | null
): Promise<string> {
	const id = generateId(15);
	await db.insert(schema.healthEvents).values({ id, companionId, ...input, loggedBy });
	return id;
}

/** The health event form fields, shared by the Health Log and the journal day. */
export function parseHealthEventForm(data: FormData, locale: Locale): FormParse<HealthEventInput> {
	const title = String(data.get('title') ?? '').trim();
	const type = parseHealthEventType(String(data.get('type') ?? ''));
	const notes = String(data.get('notes') ?? '').trim();
	const vetName = String(data.get('vetName') ?? '').trim();
	const vetClinic = String(data.get('vetClinic') ?? '').trim();
	if (!title || !type) return { ok: false, message: t(locale, 'error.titleAndTypeRequired') };
	if ([title, notes, vetName, vetClinic].some((v) => exceedsLen(v, MAX_NOTE_LEN)))
		return { ok: false, message: t(locale, 'error.fieldTooLong', { max: MAX_NOTE_LEN }) };
	const occurredAt = parseFormTimestamp(data.get('occurredAt'));
	if (!occurredAt) return { ok: false, message: t(locale, 'error.invalidDateTime') };
	return {
		ok: true,
		value: {
			type,
			title,
			notes: notes || null,
			occurredAt,
			vetName: vetName || null,
			vetClinic: vetClinic || null
		}
	};
}
