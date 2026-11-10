import { and, desc, eq, getTableColumns, inArray, sql } from 'drizzle-orm';
import { db, schema } from '#lib/server/db/index.js';
import { generateId } from '#lib/server/utils.js';
import { getAppSettings } from '#lib/server/app-settings.js';
import { exceedsLen, isValidDate, parseIdArray } from '#lib/server/validation.js';
import type { Tx } from '#lib/server/medications.js';
import type { MessageKey } from '#lib/i18n/index.js';
import { localDateISO, parseYmd } from '#lib/date.js';
import { validateLeadDays } from '#lib/reminderLeadTimes.js';
import { MAX_NOTE_LEN } from '#lib/textLimits.js';
import type { SupplyKind } from '#lib/supplies.js';

export const MAX_SUPPLY_NAME_LEN = 200;
export const MAX_SUPPLY_UNIT_LEN = 50;
export const MAX_LASTS_DAYS = 365;

export interface SupplyInput {
	name: string;
	kind: SupplyKind;
	/** Counted only. */
	unit: string | null;
	/** Counted, create only: written as the first purchase when above 0. */
	startingQuantity: number | null;
	/** Duration, create only: written as the first purchase. */
	firstPurchaseDate: string | null;
	/** Duration only, 1-365. */
	lastsDays: number | null;
	expiresOn: string | null;
	alertsEnabled: boolean;
	/** Canonical lead lists; null when every chip is cleared (that warning is off). */
	runOutLeadDays: string | null;
	expiryLeadDays: string | null;
	/** Counted only. */
	lowStockAt: number | null;
	notes: string | null;
}

/** Applied change for `delta` at `before`, clamped so the quantity never drops below 0. */
function clampedDelta(before: number, delta: number): number {
	const applied = before + delta < 0 ? -before : delta;
	return applied === 0 ? 0 : applied; // never store -0
}

/**
 * Stock side of writing a dose row, in the dose's transaction. A no-op unless
 * the medication draws from a counted supply. Records a use event (even when
 * nothing was left to subtract) with the delta actually applied. Never
 * changes `stock_version`.
 */
export function applyDoseStock(
	tx: Tx,
	dose: { id: string; medicationId: string; givenAt: Date; givenBy: string | null }
): void {
	const row = tx
		.select({
			companionId: schema.medications.companionId,
			doseUnits: schema.medications.doseUnits,
			supplyId: schema.supplies.id,
			kind: schema.supplies.kind,
			quantity: schema.supplies.quantity
		})
		.from(schema.medications)
		.innerJoin(schema.supplies, eq(schema.supplies.id, schema.medications.supplyId))
		.where(eq(schema.medications.id, dose.medicationId))
		.get();
	if (!row || row.kind !== 'counted') return;
	const before = row.quantity ?? 0;
	const applied = clampedDelta(before, -row.doseUnits);
	tx.update(schema.supplies)
		.set({ quantity: before + applied })
		.where(eq(schema.supplies.id, row.supplyId))
		.run();
	tx.insert(schema.supplyEvents)
		.values({
			id: generateId(15),
			supplyId: row.supplyId,
			type: 'use',
			at: dose.givenAt,
			quantityDelta: applied,
			doseId: dose.id,
			companionId: row.companionId,
			createdBy: dose.givenBy
		})
		.run();
}

/**
 * Stock side of deleting dose rows through app code, in the delete's
 * transaction, before the doses go: reverses each linked use event's applied
 * delta (clamped at 0) and deletes the event. Cascade deletes don't come
 * through here, so their use events stay.
 */
export function restoreDoseStock(tx: Tx, doseIds: string[]): void {
	if (doseIds.length === 0) return;
	const uses = tx
		.select({
			id: schema.supplyEvents.id,
			supplyId: schema.supplyEvents.supplyId,
			quantityDelta: schema.supplyEvents.quantityDelta
		})
		.from(schema.supplyEvents)
		.where(and(inArray(schema.supplyEvents.doseId, doseIds), eq(schema.supplyEvents.type, 'use')))
		.all();
	if (uses.length === 0) return;
	for (const u of uses) reverseDelta(tx, u.supplyId, u.quantityDelta);
	tx.delete(schema.supplyEvents)
		.where(
			inArray(
				schema.supplyEvents.id,
				uses.map((u) => u.id)
			)
		)
		.run();
}

function reverseDelta(tx: Tx, supplyId: string, delta: number | null) {
	tx.update(schema.supplies)
		.set({ quantity: sql`max(0, coalesce(${schema.supplies.quantity}, 0) - ${delta ?? 0})` })
		.where(eq(schema.supplies.id, supplyId))
		.run();
}

/** The local date of the latest remaining purchase, or null when none is left. */
function latestPurchaseDate(tx: Tx, supplyId: string): string | null {
	const latest = tx
		.select({ at: schema.supplyEvents.at })
		.from(schema.supplyEvents)
		.where(
			and(eq(schema.supplyEvents.supplyId, supplyId), eq(schema.supplyEvents.type, 'purchase'))
		)
		.orderBy(desc(schema.supplyEvents.at))
		.limit(1)
		.get();
	return latest ? localDateISO(latest.at) : null;
}

/** A purchase made today is stamped now; an earlier one at local noon of its day. */
function purchaseAt(date: string, now: Date): Date {
	if (date === localDateISO(now)) return now;
	const p = parseYmd(date);
	if (!p) throw new Error(`Invalid purchase date: ${date}`);
	return new Date(p.y, p.m - 1, p.d, 12, 0, 0);
}

/**
 * Log a purchase in the caller's transaction (so a receipt row can share it)
 * and return the event id. Counted: quantity += p.quantity. Duration:
 * `stocked_on` becomes the latest purchase date, so a backfilled older
 * purchase leaves it. Both: a given expiry replaces `expires_on`, and the
 * stock version changes. The currency is stored only alongside a cost.
 * Callers validate the fields (date not in the future, quantity > 0).
 */
export function logPurchase(
	tx: Tx,
	supplyId: string,
	p: {
		date: string;
		quantity: number | null;
		costMinor: number | null;
		currency: string;
		expiresOn: string | null;
		documentId: string | null;
		companionId: string | null;
		note: string | null;
	},
	actorId: string,
	now: Date = new Date()
): string {
	const supply = tx
		.select({ kind: schema.supplies.kind, quantity: schema.supplies.quantity })
		.from(schema.supplies)
		.where(eq(schema.supplies.id, supplyId))
		.get();
	if (!supply) throw new Error(`Supply not found: ${supplyId}`);
	const counted = supply.kind === 'counted';
	const before = supply.quantity ?? 0;
	const applied = counted ? clampedDelta(before, p.quantity ?? 0) : null;

	const id = generateId(15);
	tx.insert(schema.supplyEvents)
		.values({
			id,
			supplyId,
			type: 'purchase',
			at: purchaseAt(p.date, now),
			quantityDelta: applied,
			companionId: p.companionId,
			costMinor: p.costMinor,
			currency: p.costMinor === null ? null : p.currency,
			documentId: p.documentId,
			note: p.note,
			createdBy: actorId
		})
		.run();
	tx.update(schema.supplies)
		.set({
			...(applied === null
				? { stockedOn: latestPurchaseDate(tx, supplyId) }
				: { quantity: before + applied }),
			...(p.expiresOn ? { expiresOn: p.expiresOn } : {}),
			stockVersion: generateId(15)
		})
		.where(eq(schema.supplies.id, supplyId))
		.run();
	return id;
}

function editableFields(input: SupplyInput, kind: SupplyKind) {
	const counted = kind === 'counted';
	return {
		name: input.name,
		unit: counted ? input.unit : null,
		lowStockAt: counted ? input.lowStockAt : null,
		lastsDays: counted ? null : input.lastsDays,
		expiresOn: input.expiresOn,
		alertsEnabled: input.alertsEnabled,
		runOutLeadDays: input.runOutLeadDays,
		expiryLeadDays: input.expiryLeadDays,
		notes: input.notes
	};
}

function linkCompanions(tx: Tx, supplyId: string, companionIds: string[]) {
	if (companionIds.length === 0) return;
	tx.insert(schema.supplyCompanions)
		.values(companionIds.map((companionId) => ({ supplyId, companionId })))
		.run();
}

/**
 * Create a supply linked to `companionIds`. A counted supply starts at 0; a
 * starting quantity above 0, or a duration supply's first purchase date, is
 * written as a purchase with no cost so history starts with it.
 */
export async function createSupply(
	input: SupplyInput,
	companionIds: string[],
	actorId: string
): Promise<string> {
	const { currency } = await getAppSettings();
	const now = new Date();
	const id = generateId(15);
	const counted = input.kind === 'counted';
	const firstDate = counted
		? input.startingQuantity
			? localDateISO(now)
			: null
		: input.firstPurchaseDate;
	db.transaction(
		(tx) => {
			tx.insert(schema.supplies)
				.values({
					id,
					kind: input.kind,
					...editableFields(input, input.kind),
					quantity: counted ? 0 : null,
					createdBy: actorId
				})
				.run();
			linkCompanions(tx, id, companionIds);
			if (firstDate) {
				logPurchase(
					tx,
					id,
					{
						date: firstDate,
						quantity: counted ? input.startingQuantity : null,
						costMinor: null,
						currency,
						expiresOn: null,
						documentId: null,
						companionId: null,
						note: null
					},
					actorId,
					now
				);
			}
		},
		{ behavior: 'immediate' }
	);
	return id;
}

/**
 * Edit a supply's details and replace its companions. The kind never
 * changes (false when the input's kind differs, or the supply is gone), and
 * the quantity, `stocked_on` and starting-stock fields are left alone.
 */
export async function updateSupply(
	id: string,
	input: SupplyInput,
	companionIds: string[]
): Promise<boolean> {
	return db.transaction(
		(tx) => {
			const existing = tx
				.select({ kind: schema.supplies.kind })
				.from(schema.supplies)
				.where(eq(schema.supplies.id, id))
				.get();
			if (!existing || existing.kind !== input.kind) return false;
			tx.update(schema.supplies)
				.set(editableFields(input, existing.kind))
				.where(eq(schema.supplies.id, id))
				.run();
			tx.delete(schema.supplyCompanions).where(eq(schema.supplyCompanions.supplyId, id)).run();
			linkCompanions(tx, id, companionIds);
			return true;
		},
		{ behavior: 'immediate' }
	);
}

/** Delete a supply with its links and history; linked medications keep going without one. */
export async function deleteSupply(id: string): Promise<boolean> {
	const rows = await db
		.delete(schema.supplies)
		.where(eq(schema.supplies.id, id))
		.returning({ id: schema.supplies.id });
	return rows.length > 0;
}

/**
 * Set a counted supply's quantity to what is really there. The same value
 * writes nothing and keeps the stock version.
 */
export async function correctCount(
	supplyId: string,
	actual: number,
	actorId: string,
	note: string | null
): Promise<'corrected' | 'unchanged' | 'notFound'> {
	return db.transaction(
		(tx) => {
			const supply = tx
				.select({ kind: schema.supplies.kind, quantity: schema.supplies.quantity })
				.from(schema.supplies)
				.where(eq(schema.supplies.id, supplyId))
				.get();
			if (!supply || supply.kind !== 'counted') return 'notFound';
			const current = supply.quantity ?? 0;
			if (actual === current) return 'unchanged';
			tx.insert(schema.supplyEvents)
				.values({
					id: generateId(15),
					supplyId,
					type: 'correction',
					at: new Date(),
					quantityDelta: actual - current,
					note,
					createdBy: actorId
				})
				.run();
			tx.update(schema.supplies)
				.set({ quantity: actual, stockVersion: generateId(15) })
				.where(eq(schema.supplies.id, supplyId))
				.run();
			return 'corrected';
		},
		{ behavior: 'immediate' }
	);
}

/**
 * Delete a purchase or correction from a supply's history, reversing its
 * applied delta (clamped at 0). A duration supply's `stocked_on` falls back to
 * the latest remaining purchase, or null. Use events are refused: remove the
 * dose instead.
 */
export async function deleteSupplyEvent(supplyId: string, eventId: string): Promise<boolean> {
	return db.transaction(
		(tx) => {
			const event = tx
				.select({
					type: schema.supplyEvents.type,
					quantityDelta: schema.supplyEvents.quantityDelta
				})
				.from(schema.supplyEvents)
				.where(and(eq(schema.supplyEvents.id, eventId), eq(schema.supplyEvents.supplyId, supplyId)))
				.get();
			if (!event || event.type === 'use') return false;
			tx.delete(schema.supplyEvents).where(eq(schema.supplyEvents.id, eventId)).run();
			const supply = tx
				.select({ kind: schema.supplies.kind })
				.from(schema.supplies)
				.where(eq(schema.supplies.id, supplyId))
				.get();
			if (supply?.kind === 'counted') reverseDelta(tx, supplyId, event.quantityDelta);
			tx.update(schema.supplies)
				.set({
					...(supply?.kind === 'duration' ? { stockedOn: latestPurchaseDate(tx, supplyId) } : {}),
					stockVersion: generateId(15)
				})
				.where(eq(schema.supplies.id, supplyId))
				.run();
			return true;
		},
		{ behavior: 'immediate' }
	);
}

/** The supply row, or undefined unless it is linked to this companion. */
export async function getSupplyForCompanion(companionId: string, id: string) {
	const [row] = await db
		.select(getTableColumns(schema.supplies))
		.from(schema.supplies)
		.innerJoin(
			schema.supplyCompanions,
			and(
				eq(schema.supplyCompanions.supplyId, schema.supplies.id),
				eq(schema.supplyCompanions.companionId, companionId)
			)
		)
		.where(eq(schema.supplies.id, id))
		.limit(1);
	return row;
}

const LEAD_ERROR_KEYS = {
	invalid: 'error.invalidLeadDays',
	tooMany: 'error.tooManyLeadDays',
	tooLong: 'error.leadDaysTooLong'
} as const satisfies Record<string, MessageKey>;

/** A non-negative decimal (`.` or `,`); null when blank. */
function parseAmount(raw: unknown): number | null | 'invalid' {
	const text = String(raw ?? '').trim();
	if (!text) return null;
	if (!/^(?:\d+(?:[.,]\d*)?|[.,]\d+)$/.test(text)) return 'invalid';
	const n = Number(text.replace(',', '.'));
	return Number.isFinite(n) ? n : 'invalid';
}

/**
 * Parse the add/edit supply form. Fields:
 * - `name` (required, max 200), `kind` (`counted` | `duration`; edit forms
 *   post the existing kind as a hidden field, since `updateSupply` refuses a
 *   different one), `notes`, `expiresOn` (YYYY-MM-DD, optional).
 * - Counted: `unit` (max 50), `startingQuantity` (create only), `lowStockAt`;
 *   both decimals >= 0 with `.` or `,`, blank for none.
 * - Duration: `lastsDays` (1-365, required), `firstPurchaseDate` (create
 *   only, optional, not in the future).
 * - `alertsEnabled`: checkbox, any value means on.
 * - `runOutLeadDays`, `expiryLeadDays`: the comma-joined text LeadDaysPicker
 *   posts; blank (every chip cleared) turns that warning off.
 * - `companionIds`: repeated, at least one.
 * Fields of the other kind are ignored.
 */
export function parseSupplyForm(
	data: FormData,
	today: string = localDateISO()
): { ok: true; value: SupplyInput; companionIds: string[] } | { ok: false; error: MessageKey } {
	const text = (key: string) => String(data.get(key) ?? '').trim();
	const name = text('name');
	const kind = text('kind');
	const unit = text('unit');
	const notes = text('notes');
	const expiresOn = text('expiresOn');
	const companionIds = parseIdArray(data.getAll('companionIds'));

	if (!name) return { ok: false, error: 'error.nameRequired' };
	if (exceedsLen(name, MAX_SUPPLY_NAME_LEN)) return { ok: false, error: 'error.supplyNameTooLong' };
	if (kind !== 'counted' && kind !== 'duration')
		return { ok: false, error: 'error.invalidSupplyKind' };
	if (exceedsLen(notes, MAX_NOTE_LEN)) return { ok: false, error: 'error.supplyNotesTooLong' };
	if (expiresOn && !isValidDate(expiresOn)) return { ok: false, error: 'error.invalidDate' };

	let startingQuantity: number | null = null;
	let lowStockAt: number | null = null;
	let lastsDays: number | null = null;
	let firstPurchaseDate: string | null = null;
	if (kind === 'counted') {
		if (exceedsLen(unit, MAX_SUPPLY_UNIT_LEN))
			return { ok: false, error: 'error.supplyUnitTooLong' };
		const start = parseAmount(data.get('startingQuantity'));
		const low = parseAmount(data.get('lowStockAt'));
		if (start === 'invalid' || low === 'invalid')
			return { ok: false, error: 'error.invalidQuantity' };
		startingQuantity = start;
		lowStockAt = low;
	} else {
		const lasts = text('lastsDays');
		if (!/^\d+$/.test(lasts) || Number(lasts) < 1 || Number(lasts) > MAX_LASTS_DAYS)
			return { ok: false, error: 'error.invalidLastsDays' };
		lastsDays = Number(lasts);
		const first = text('firstPurchaseDate');
		if (first && !isValidDate(first)) return { ok: false, error: 'error.invalidDate' };
		if (first > today) return { ok: false, error: 'error.purchaseInFuture' };
		firstPurchaseDate = first || null;
	}

	const runOut = validateLeadDays(text('runOutLeadDays'), null);
	if (!runOut.ok) return { ok: false, error: LEAD_ERROR_KEYS[runOut.reason] };
	const expiry = validateLeadDays(text('expiryLeadDays'), null);
	if (!expiry.ok) return { ok: false, error: LEAD_ERROR_KEYS[expiry.reason] };

	if (companionIds.length === 0) return { ok: false, error: 'error.noCompanionsSelected' };

	return {
		ok: true,
		value: {
			name,
			kind,
			unit: kind === 'counted' ? unit || null : null,
			startingQuantity,
			firstPurchaseDate,
			lastsDays,
			expiresOn: expiresOn || null,
			alertsEnabled: data.has('alertsEnabled'),
			runOutLeadDays: runOut.value,
			expiryLeadDays: expiry.value,
			lowStockAt,
			notes: notes || null
		},
		companionIds
	};
}
