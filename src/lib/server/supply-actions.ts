import { fail, redirect, type Action, type ActionFailure, type RequestEvent } from '@sveltejs/kit';
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
	firstPurchaseDateOf,
	getSupplyForCompanion,
	insertSupply,
	loadSupplyStates,
	logPurchase,
	parseAmount,
	parseSupplyForm
} from '#lib/server/supplies.js';
import type { Tx } from '#lib/server/db/tx.js';
import { exceedsLen, isValidDate } from '#lib/server/validation.js';
import { localDateISO } from '#lib/date.js';
import { parseMoney } from '#lib/money.js';
import { parseLeadDays } from '#lib/reminderLeadTimes.js';
import { MAX_NOTE_LEN } from '#lib/textLimits.js';
import {
	MAX_SUPPLY_QUANTITY,
	type SupplyCompanionOption,
	type SupplyFormValues
} from '#lib/supplies.js';

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
		cost: field('cost'),
		expiresOn: field('expiresOn'),
		alertsEnabled: data.has('alertsEnabled'),
		runOutLeadDays: parseLeadDays(field('runOutLeadDays') || null),
		expiryLeadDays: parseLeadDays(field('expiryLeadDays') || null),
		lowStockAt: field('lowStockAt'),
		notes: field('notes'),
		companionIds: data.getAll('companionIds').map(String)
	};
}

/** A receipt stored before its transaction, waiting for its document row. */
interface StagedReceipt {
	stored: StoredDocument;
	originalName: string | null;
	companionId: string;
}

/** Whether the form carries a receipt: a non-empty file (an empty input still posts one) or a Paperless pick. */
function receiptFile(data: FormData): File | null {
	const file = data.get('receipt');
	return file instanceof File && file.size > 0 ? file : null;
}

function hasReceipt(data: FormData): boolean {
	return receiptFile(data) !== null || String(data.get('paperlessId') ?? '').trim() !== '';
}

/**
 * Store the posted receipt (a `receipt` file or a `paperlessId`) under
 * `companionId`, before any transaction. `receipt` is null when none was
 * posted. Callers discard it on every failure after this.
 */
async function stageReceipt(
	data: FormData,
	companionId: string,
	locale: Locale
): Promise<{ receipt: StagedReceipt | null } | { status: number; error: string }> {
	const upload = receiptFile(data);
	const paperlessId = String(data.get('paperlessId') ?? '').trim();
	try {
		if (upload) {
			const prep = await prepareUpload(upload);
			if (!prep.ok)
				return {
					status: 400,
					error:
						prep.error === 'tooLarge'
							? t(locale, 'error.fileTooLarge', { max: UPLOAD_MAX_MB })
							: t(locale, 'error.invalidFileType')
				};
			const stored = await storePrepared(companionId, prep.prepared);
			return { receipt: { stored, originalName: prep.prepared.originalName, companionId } };
		}
		if (paperlessId) {
			const prep = await preparePaperless(paperlessId);
			if (!prep.ok)
				return {
					status: 400,
					error: t(
						locale,
						prep.error === 'invalidType' ? 'error.invalidFileType' : 'error.notFound'
					)
				};
			return { receipt: { stored: prep.stored, originalName: null, companionId } };
		}
		return { receipt: null };
	} catch (err) {
		console.error('[supplies] receipt storage failed:', err);
		return { status: 502, error: t(locale, 'error.purchaseFailed') };
	}
}

/**
 * The staged receipt's document row, in the purchase's transaction. Returns
 * the document id, or 'capReached' with nothing written.
 */
function insertReceipt(
	tx: Tx,
	receipt: StagedReceipt,
	p: { supplyName: string; date: string; locale: Locale; uploadedBy: string }
): string | 'capReached' {
	const inserted = insertDocumentRow(tx, receipt.companionId, receipt.stored, {
		title: t(p.locale, 'page.supplies.receiptTitle', { name: p.supplyName }).slice(0, 255),
		category: 'receipt',
		documentDate: p.date,
		healthEventId: null,
		originalName: receipt.originalName,
		uploadedBy: p.uploadedBy
	});
	if (inserted === 'capReached') return 'capReached';
	// A Paperless document already on this pet is linked, not imported twice.
	return inserted === 'inserted' ? receipt.stored.id : inserted.existingId;
}

/**
 * Run `write` (the receipt row and the purchase) in one transaction. A throw
 * or the document cap removes the stored receipt and becomes a failure.
 */
async function commitWithReceipt<T>(
	receipt: StagedReceipt | null,
	locale: Locale,
	extra: Record<string, unknown>,
	write: (tx: Tx) => T | 'capReached'
): Promise<
	{ ok: true; value: T } | { ok: false; failure: ActionFailure<Record<string, unknown>> }
> {
	let outcome: T | 'capReached';
	try {
		outcome = db.transaction(write, { behavior: 'immediate' });
	} catch (err) {
		console.error('[supplies] purchase failed:', err);
		if (receipt) await discardStored(receipt.stored);
		return {
			ok: false,
			failure: fail(400, { error: t(locale, 'error.purchaseFailed'), ...extra })
		};
	}
	if (outcome === 'capReached') {
		if (receipt) await discardStored(receipt.stored);
		return {
			ok: false,
			failure: fail(400, {
				error: t(locale, 'error.maxDocumentsExceeded', { max: MAX_DOCUMENTS_PER_COMPANION }),
				...extra
			})
		};
	}
	return { ok: true, value: outcome };
}

/**
 * New supply. On top of the supply form, an optional `cost` and receipt
 * (`receipt` file or `paperlessId`) go on the first purchase, which needs a
 * starting quantity (counted) or first purchase date (duration). The receipt
 * is filed under the pet the supply opens on, a linked active pet.
 */
export const createAction: Action<{ companionId: string }> = async ({
	request,
	params,
	locals
}) => {
	const denied = await ownerOnly(locals, params.companionId);
	if (denied) return denied;
	const locale = locals.locale;
	const data = await request.formData();
	const values = supplyFormValues(data);
	const bad = (key: MessageKey, vars?: Record<string, string | number>) =>
		fail(400, { error: t(locale, key, vars), values });

	const today = localDateISO();
	const parsed = parseSupplyForm(data, today);
	if (!parsed.ok) return bad(parsed.error, parsed.vars);
	const options = await supplyCompanionOptions();
	const refused = refuseCompanions(parsed.companionIds, options, locale, values);
	if (refused) return refused;
	const { currency } = await getAppSettings();
	const cost = parseMoney(String(data.get('cost') ?? '').trim(), currency);
	if (cost === 'invalid') return bad('error.invalidCost');
	const date = firstPurchaseDateOf(parsed.value, today);
	if ((cost !== null || hasReceipt(data)) && !date)
		return bad(
			parsed.value.kind === 'counted' ? 'error.purchaseNeedsStock' : 'error.purchaseNeedsDate'
		);

	const home = supplyHome(params.companionId, parsed.companionIds, options);
	const staged = await stageReceipt(data, home, locale);
	if ('error' in staged) return fail(staged.status, { error: staged.error, values });
	const { receipt } = staged;

	const result = await commitWithReceipt(receipt, locale, { values }, (tx) => {
		let documentId: string | null = null;
		if (receipt) {
			const inserted = insertReceipt(tx, receipt, {
				supplyName: parsed.value.name,
				date: date!,
				locale,
				uploadedBy: locals.user!.id
			});
			if (inserted === 'capReached') return 'capReached';
			documentId = inserted;
		}
		return insertSupply(tx, parsed.value, parsed.companionIds, locals.user!.id, currency, {
			costMinor: cost,
			documentId,
			companionId: receipt ? home : null
		});
	});
	if (!result.ok) return result.failure;
	redirect(303, `/${home}/supplies/${result.value}`);
};

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
		if (parsed === 'tooLarge') return bad('error.quantityTooLarge', { max: MAX_SUPPLY_QUANTITY });
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

	const staged = await stageReceipt(data, receiptCompanionId, locale);
	if ('error' in staged) return fail(staged.status, { error: staged.error });
	const { receipt } = staged;

	const result = await commitWithReceipt(receipt, locale, {}, (tx) => {
		let documentId: string | null = null;
		if (receipt) {
			const inserted = insertReceipt(tx, receipt, {
				supplyName: supply.name,
				date,
				locale,
				uploadedBy: locals.user!.id
			});
			if (inserted === 'capReached') return 'capReached';
			documentId = inserted;
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
				companionId: receipt ? receiptCompanionId : null,
				note: note || null
			},
			locals.user!.id
		);
		return 'logged' as const;
	});
	if (!result.ok) return result.failure;
	return { purchased: true };
};
