import { fail, type Action, type ActionFailure, type RequestEvent } from '@sveltejs/kit';
import { asc, eq, inArray, or } from 'drizzle-orm';
import { t, type Locale, type MessageKey } from '#lib/i18n/index.js';
import { db, schema } from '#lib/server/db/index.js';
import { getAppSettings } from '#lib/server/app-settings.js';
import {
	discardStored,
	insertDocumentRow,
	preparePaperless,
	prepareUpload,
	storePrepared,
	type StoredDocument
} from '#lib/server/documents.js';
import { MAX_DOCUMENTS_PER_COMPANION, UPLOAD_MAX_MB } from '#lib/server/env.js';
import { ownerOnly } from '#lib/server/medication-actions.js';
import {
	getSupplyForCompanion,
	loadSupplyStates,
	logPurchase,
	parseAmount
} from '#lib/server/supplies.js';
import { exceedsLen, isValidDate } from '#lib/server/validation.js';
import { localDateISO } from '#lib/date.js';
import { parseMoney } from '#lib/money.js';
import { parseLeadDays } from '#lib/reminderLeadTimes.js';
import { MAX_NOTE_LEN } from '#lib/textLimits.js';
import type { SupplyCompanionOption, SupplyFormValues } from '#lib/supplies.js';

type Locals = RequestEvent['locals'];
type Failure = ActionFailure<{ error: string }>;

/**
 * Supply pages only: ownerOnly (role, known and active companion) plus the
 * supply being linked to the route's companion. Actions run before load, so
 * every supply action starts here.
 */
export async function supplyOwnerOnly(
	locals: Locals,
	companionId: string,
	supplyId: string
): Promise<Failure | null> {
	const denied = await ownerOnly(locals, companionId);
	if (denied) return denied;
	if (!supplyId || !(await getSupplyForCompanion(companionId, supplyId)))
		return fail(404, { error: t(locals.locale, 'error.supplyNotFound') });
	return null;
}

/** The pets the form offers: active ones, plus archived ones already linked, by name. */
export async function supplyCompanionOptions(
	linkedIds: string[] = []
): Promise<SupplyCompanionOption[]> {
	const { id, name, isActive } = schema.companions;
	return db
		.select({ id, name, isActive })
		.from(schema.companions)
		.where(
			linkedIds.length > 0 ? or(eq(isActive, true), inArray(id, linkedIds)) : eq(isActive, true)
		)
		.orderBy(asc(name), asc(id));
}

export async function linkedCompanionIds(supplyId: string): Promise<string[]> {
	const rows = await db
		.select({ id: schema.supplyCompanions.companionId })
		.from(schema.supplyCompanions)
		.where(eq(schema.supplyCompanions.supplyId, supplyId));
	return rows.map((r) => r.id);
}

/**
 * Checked pets must all be on offer (an unknown id, or an archived pet that
 * wasn't linked, is refused) and at least one must be active, so the supply
 * stays reachable and warns.
 */
export function refuseCompanions(
	ids: string[],
	options: SupplyCompanionOption[],
	locale: Locale,
	values: SupplyFormValues
) {
	const offered = new Map(options.map((o) => [o.id, o]));
	if (!ids.every((id) => offered.has(id)))
		return fail(400, { error: t(locale, 'error.companionNotFound'), values });
	if (!ids.some((id) => offered.get(id)?.isActive))
		return fail(400, { error: t(locale, 'error.supplyNeedsActivePet'), values });
	return null;
}

/** Where a saved supply opens: the route's pet while linked, else the first active linked pet. */
export function supplyHome(
	routeCompanionId: string,
	ids: string[],
	options: SupplyCompanionOption[]
): string {
	if (ids.includes(routeCompanionId)) return routeCompanionId;
	return options.find((o) => o.isActive && ids.includes(o.id))?.id ?? routeCompanionId;
}

/** What was typed, so a failed save re-renders the form with it. */
export function supplyFormValues(data: FormData): SupplyFormValues {
	const field = (name: string) => String(data.get(name) ?? '');
	return {
		name: field('name'),
		kind: field('kind'),
		unit: field('unit'),
		startingQuantity: field('startingQuantity'),
		lastsDays: field('lastsDays'),
		firstPurchaseDate: field('firstPurchaseDate'),
		expiresOn: field('expiresOn'),
		alertsEnabled: data.has('alertsEnabled'),
		runOutLeadDays: parseLeadDays(field('runOutLeadDays') || null),
		expiryLeadDays: parseLeadDays(field('expiryLeadDays') || null),
		lowStockAt: field('lowStockAt'),
		notes: field('notes'),
		companionIds: data.getAll('companionIds').map(String)
	};
}

/**
 * Log purchase on the supply page. Fields: `date` (not in the future),
 * `quantity` (counted, > 0), `cost`, `expiresOn`, `note`, and an optional
 * receipt: a `receipt` file or a `paperlessId`, filed under
 * `receiptCompanionId` (an active pet the supply is linked to; the route's pet
 * when blank). The receipt object is stored first; its row and the purchase
 * then share one transaction, and a failed one removes the stored object.
 */
export const purchaseAction: Action<{ companionId: string; id: string }> = async ({
	request,
	params,
	locals
}) => {
	const denied = await supplyOwnerOnly(locals, params.companionId, params.id);
	if (denied) return denied;
	const locale = locals.locale;
	const bad = (key: MessageKey, vars?: Record<string, string | number>) =>
		fail(400, { error: t(locale, key, vars) });

	const today = localDateISO();
	const [supply] = await loadSupplyStates({ supplyId: params.id, today });
	if (!supply) return fail(404, { error: t(locale, 'error.supplyNotFound') });

	const data = await request.formData();
	const text = (key: string) => String(data.get(key) ?? '').trim();

	const date = text('date');
	if (!isValidDate(date)) return bad('error.invalidDate');
	if (date > today) return bad('error.purchaseInFuture');
	let quantity: number | null = null;
	if (supply.kind === 'counted') {
		const parsed = parseAmount(data.get('quantity'));
		if (typeof parsed !== 'number' || !(parsed > 0)) return bad('error.invalidPurchaseQuantity');
		quantity = parsed;
	}
	const { currency } = await getAppSettings();
	const cost = parseMoney(text('cost'), currency);
	if (cost === 'invalid') return bad('error.invalidCost');
	const expiresOn = text('expiresOn');
	if (expiresOn && !isValidDate(expiresOn)) return bad('error.invalidDate');
	const note = text('note');
	if (exceedsLen(note, MAX_NOTE_LEN)) return bad('error.noteTooLong', { max: MAX_NOTE_LEN });
	const receiptCompanionId = text('receiptCompanionId') || params.companionId;
	if (!supply.companions.some((c) => c.isActive && c.id === receiptCompanionId))
		return bad('error.companionNotFound');

	// A form with an empty file input still posts a zero-byte file.
	const file = data.get('receipt');
	const upload = file instanceof File && file.size > 0 ? file : null;
	const paperlessId = text('paperlessId');
	let stored: StoredDocument | null = null;
	let originalName: string | null = null;
	try {
		if (upload) {
			const prep = await prepareUpload(upload);
			if (!prep.ok) {
				if (prep.error === 'tooLarge') return bad('error.fileTooLarge', { max: UPLOAD_MAX_MB });
				return bad('error.invalidFileType');
			}
			originalName = prep.prepared.originalName;
			stored = await storePrepared(receiptCompanionId, prep.prepared);
		} else if (paperlessId) {
			const prep = await preparePaperless(paperlessId);
			if (!prep.ok)
				return bad(prep.error === 'invalidType' ? 'error.invalidFileType' : 'error.notFound');
			stored = prep.stored;
		}
	} catch (err) {
		console.error('[supplies] receipt storage failed:', err);
		return fail(502, { error: t(locale, 'error.purchaseFailed') });
	}

	let outcome: 'logged' | 'capReached';
	try {
		outcome = db.transaction(
			(tx) => {
				let documentId: string | null = null;
				if (stored) {
					const inserted = insertDocumentRow(tx, receiptCompanionId, stored, {
						title: t(locale, 'page.supplies.receiptTitle', { name: supply.name }).slice(0, 255),
						category: 'receipt',
						documentDate: date,
						healthEventId: null,
						originalName,
						uploadedBy: locals.user!.id
					});
					if (inserted === 'capReached') return 'capReached';
					// A Paperless document already on this pet is linked, not imported twice.
					documentId = inserted === 'inserted' ? stored.id : inserted.existingId;
				}
				logPurchase(
					tx,
					params.id,
					{
						date,
						quantity,
						costMinor: cost,
						currency,
						expiresOn: expiresOn || null,
						documentId,
						companionId: stored ? receiptCompanionId : null,
						note: note || null
					},
					locals.user!.id
				);
				return 'logged';
			},
			{ behavior: 'immediate' }
		);
	} catch (err) {
		console.error('[supplies] purchase failed:', err);
		if (stored) await discardStored(stored);
		return bad('error.purchaseFailed');
	}
	if (outcome === 'capReached') {
		if (stored) await discardStored(stored);
		return bad('error.maxDocumentsExceeded', { max: MAX_DOCUMENTS_PER_COMPANION });
	}
	return { purchased: true };
};
