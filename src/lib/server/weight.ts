import { db, schema } from '$lib/server/db';
import { generateId } from '$lib/server/utils';
import { t, type Locale } from '$lib/i18n';
import { MAX_NOTE_LEN } from '$lib/textLimits';
import {
	exceedsLen,
	parseFormTimestamp,
	parseWeightUnit,
	type FormParse,
	type WeightUnit
} from '$lib/server/validation';

export interface WeightEntryInput {
	weight: number;
	unit: WeightUnit;
	notes: string | null;
	recordedAt: Date;
}

// Pure insert: one weight_entries row. See health.ts for the scope rationale.
export async function createWeightEntry(
	companionId: string,
	input: WeightEntryInput,
	loggedBy: string | null
): Promise<string> {
	const id = generateId(15);
	await db.insert(schema.weightEntries).values({ id, companionId, ...input, loggedBy });
	return id;
}

/** The weight form fields, shared by the Health Log and the journal day. */
export function parseWeightForm(
	data: FormData,
	defaultUnit: WeightUnit,
	locale: Locale
): FormParse<WeightEntryInput> {
	const weight = parseFloat(String(data.get('weight') ?? ''));
	if (!Number.isFinite(weight) || weight <= 0)
		return { ok: false, message: t(locale, 'error.validWeightRequired') };
	const unit = parseWeightUnit(String(data.get('unit') ?? ''), defaultUnit);
	const notes = String(data.get('notes') ?? '').trim();
	if (exceedsLen(notes, MAX_NOTE_LEN))
		return { ok: false, message: t(locale, 'error.fieldTooLong', { max: MAX_NOTE_LEN }) };
	const recordedAt = parseFormTimestamp(data.get('recordedAt'));
	if (!recordedAt) return { ok: false, message: t(locale, 'error.invalidDateTime') };
	return { ok: true, value: { weight, unit, notes: notes || null, recordedAt } };
}
