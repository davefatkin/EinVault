import {
	and,
	asc,
	desc,
	eq,
	exists,
	getTableColumns,
	inArray,
	isNull,
	notInArray,
	sql
} from 'drizzle-orm';
import { db, schema } from '#lib/server/db/index.js';
import { generateId } from '#lib/server/utils.js';
import { getAppSettings } from '#lib/server/app-settings.js';
import { exceedsLen, isValidDate, parseIdArray } from '#lib/server/validation.js';
import { medicationActiveSql } from '#lib/server/medication-sql.js';
import type { Tx } from '#lib/server/db/tx.js';
import type { MessageKey } from '#lib/i18n/index.js';
import { localDateISO, parseYmd } from '#lib/date.js';
import { parseLeadDays, validateLeadDays } from '#lib/reminderLeadTimes.js';
import { MAX_NOTE_LEN } from '#lib/textLimits.js';
import type { MedicationSupplyOption } from '#lib/medications.js';
import {
	dailyUse,
	MAX_LASTS_DAYS,
	MAX_SUPPLY_NAME_LEN,
	MAX_SUPPLY_QUANTITY,
	MAX_SUPPLY_UNIT_LEN,
	projectRunOut,
	supplyAttention,
	type SupplyEventView,
	type SupplyKind,
	type SupplySummary
} from '#lib/supplies.js';

export interface SupplyInput {
	name: string;
	kind: SupplyKind;
	/** Counted only. */
	unit: string | null;
	/** Counted, create only: written as the first purchase when above 0. */
	startingQuantity: number | null;
	/**
	 * Create only, the first purchase's date. Duration: written as the first
	 * purchase. Counted: when the starting quantity was bought (today when null).
	 */
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

/**
 * A quantity or delta rounded to 6 decimals, so tenths add up exactly and no
 * 1e-17 residue is left behind. Never -0.
 */
function roundQuantity(x: number): number {
	const r = Math.round(x * 1e6) / 1e6;
	return r === 0 ? 0 : r;
}

/**
 * Applies `delta` at `before`, clamped so the quantity never drops below 0.
 * Both results are rounded, and `applied` is exactly `after - before`, so
 * reversing it restores `before`.
 */
function applyDelta(before: number, delta: number): { after: number; applied: number } {
	const from = roundQuantity(before);
	const after = Math.max(0, roundQuantity(from + delta));
	return { after, applied: roundQuantity(after - from) };
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
	const { after, applied } = applyDelta(row.quantity ?? 0, -row.doseUnits);
	tx.update(schema.supplies)
		.set({ quantity: after })
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
		.set({
			quantity: sql`max(0, round(coalesce(${schema.supplies.quantity}, 0) - ${delta ?? 0}, 6))`
		})
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
	const stock =
		supply.kind === 'counted' ? applyDelta(supply.quantity ?? 0, p.quantity ?? 0) : null;

	const id = generateId(15);
	tx.insert(schema.supplyEvents)
		.values({
			id,
			supplyId,
			type: 'purchase',
			at: purchaseAt(p.date, now),
			quantityDelta: stock?.applied ?? null,
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
			...(stock === null
				? { stockedOn: latestPurchaseDate(tx, supplyId) }
				: { quantity: stock.after }),
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

/** What the create form adds to the first purchase: a cost and a stored receipt. */
export interface FirstPurchaseExtras {
	costMinor: number | null;
	/** A document row already inserted in the same transaction. */
	documentId: string | null;
	/** The pet the receipt is filed under; set only with a receipt. */
	companionId: string | null;
}

/**
 * The first purchase's date, or null when there is none: a counted supply's
 * starting quantity above 0 (bought on `firstPurchaseDate`, today when
 * blank), or a duration supply's first purchase date.
 */
export function firstPurchaseDateOf(input: SupplyInput, today: string): string | null {
	if (input.kind === 'counted')
		return input.startingQuantity ? (input.firstPurchaseDate ?? today) : null;
	return input.firstPurchaseDate;
}

/**
 * Insert a supply linked to `companionIds` in the caller's transaction (so a
 * receipt row can share it). A counted supply starts at 0; its starting
 * quantity, or a duration supply's first purchase date, is written as a
 * purchase so history starts with it, carrying `extras` when given.
 */
export function insertSupply(
	tx: Tx,
	input: SupplyInput,
	companionIds: string[],
	actorId: string,
	currency: string,
	extras: FirstPurchaseExtras | null = null,
	now: Date = new Date()
): string {
	const id = generateId(15);
	const counted = input.kind === 'counted';
	const firstDate = firstPurchaseDateOf(input, localDateISO(now));
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
				costMinor: extras?.costMinor ?? null,
				currency,
				expiresOn: null,
				documentId: extras?.documentId ?? null,
				companionId: extras?.companionId ?? null,
				note: null
			},
			actorId,
			now
		);
	}
	return id;
}

/** insertSupply in its own transaction, with no cost or receipt. */
export async function createSupply(
	input: SupplyInput,
	companionIds: string[],
	actorId: string
): Promise<string> {
	const { currency } = await getAppSettings();
	return db.transaction((tx) => insertSupply(tx, input, companionIds, actorId, currency), {
		behavior: 'immediate'
	});
}

/**
 * Edit a supply's details and replace its companions. The kind never
 * changes (false when the input's kind differs, or the supply is gone), and
 * the quantity, `stocked_on` and starting-stock fields are left alone.
 * Medications of a pet taken off the supply are unlinked from it.
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
			// A pet no longer linked stops drawing from the supply.
			tx.update(schema.medications)
				.set({ supplyId: null })
				.where(
					and(
						eq(schema.medications.supplyId, id),
						notInArray(schema.medications.companionId, companionIds)
					)
				)
				.run();
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
			const current = roundQuantity(supply.quantity ?? 0);
			const target = roundQuantity(actual);
			if (target === current) return 'unchanged';
			tx.insert(schema.supplyEvents)
				.values({
					id: generateId(15),
					supplyId,
					type: 'correction',
					at: new Date(),
					quantityDelta: roundQuantity(target - current),
					note,
					createdBy: actorId
				})
				.run();
			tx.update(schema.supplies)
				.set({ quantity: target, stockVersion: generateId(15) })
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

/** Whether any supply is linked to this companion. */
export async function companionHasSupplies(companionId: string): Promise<boolean> {
	const [row] = await db
		.select({ id: schema.supplyCompanions.supplyId })
		.from(schema.supplyCompanions)
		.where(eq(schema.supplyCompanions.companionId, companionId))
		.limit(1);
	return row !== undefined;
}

/** Counted supplies linked to this companion, by name: what a medication can draw from. */
export async function listCountedSupplyOptions(
	companionId: string
): Promise<MedicationSupplyOption[]> {
	return db
		.select({ id: schema.supplies.id, name: schema.supplies.name, unit: schema.supplies.unit })
		.from(schema.supplies)
		.innerJoin(
			schema.supplyCompanions,
			and(
				eq(schema.supplyCompanions.supplyId, schema.supplies.id),
				eq(schema.supplyCompanions.companionId, companionId)
			)
		)
		.where(eq(schema.supplies.kind, 'counted'))
		.orderBy(asc(schema.supplies.name), asc(schema.supplies.id));
}

/**
 * A supply's history, newest first (insertion order breaks ties within a
 * second), with the pet of each use, who logged it and the receipt link.
 */
export async function listSupplyEvents(
	supplyId: string,
	limit: number
): Promise<SupplyEventView[]> {
	const rows = await db
		.select({
			id: schema.supplyEvents.id,
			type: schema.supplyEvents.type,
			at: schema.supplyEvents.at,
			quantityDelta: schema.supplyEvents.quantityDelta,
			costMinor: schema.supplyEvents.costMinor,
			currency: schema.supplyEvents.currency,
			note: schema.supplyEvents.note,
			companionName: schema.companions.name,
			createdBy: schema.users.displayName,
			docCompanionId: schema.documents.companionId,
			docFilename: schema.documents.filename,
			docTitle: schema.documents.title
		})
		.from(schema.supplyEvents)
		.leftJoin(schema.companions, eq(schema.companions.id, schema.supplyEvents.companionId))
		.leftJoin(schema.users, eq(schema.users.id, schema.supplyEvents.createdBy))
		.leftJoin(schema.documents, eq(schema.documents.id, schema.supplyEvents.documentId))
		.where(eq(schema.supplyEvents.supplyId, supplyId))
		.orderBy(desc(schema.supplyEvents.at), desc(sql`${schema.supplyEvents}.rowid`))
		.limit(limit);
	return rows.map(({ docCompanionId, docFilename, docTitle, companionName, ...r }) => ({
		...r,
		// Only a use names its pet; a purchase's pet is where the receipt went.
		companionName: r.type === 'use' ? companionName : null,
		receipt:
			docCompanionId && docFilename
				? { url: `/api/documents/${docCompanionId}/${docFilename}`, title: docTitle ?? '' }
				: null
	}));
}

export type SupplyState = SupplySummary & {
	stockVersion: string;
	runOutLeads: number[];
	expiryLeads: number[];
	runOutAlerted: string | null;
	lowAlerted: string | null;
	expiryAlerted: string | null;
};

/** The display fields of a state, without the warning bookkeeping. */
export function toSupplySummary(s: SupplyState): SupplySummary {
	return {
		id: s.id,
		name: s.name,
		kind: s.kind,
		unit: s.unit,
		quantity: s.quantity,
		lastsDays: s.lastsDays,
		stockedOn: s.stockedOn,
		expiresOn: s.expiresOn,
		alertsEnabled: s.alertsEnabled,
		lowStockAt: s.lowStockAt,
		runOutOn: s.runOutOn,
		daysLeft: s.daysLeft,
		runningLow: s.runningLow,
		expiring: s.expiring,
		expired: s.expired,
		companions: s.companions
	};
}

/**
 * Supplies with their run-out projection and attention flags as of `today`,
 * ordered by name. Filters: linked to `companionId`; `alertsOnly` keeps
 * supplies with warnings on; `activeOnly` keeps supplies with at least one
 * active pet; `supplyId` loads one. `companions` always lists every linked
 * pet, by name. Daily use counts each open recurring reminder series once
 * (`seriesId ?? id`) for active medications drawing from the supply.
 */
export async function loadSupplyStates(opts: {
	companionId?: string;
	supplyId?: string;
	today: string;
	alertsOnly?: boolean;
	activeOnly?: boolean;
}): Promise<SupplyState[]> {
	const linked = (companionCondition?: ReturnType<typeof eq>) =>
		exists(
			db
				.select({ one: sql`1` })
				.from(schema.supplyCompanions)
				.innerJoin(schema.companions, eq(schema.companions.id, schema.supplyCompanions.companionId))
				.where(and(eq(schema.supplyCompanions.supplyId, schema.supplies.id), companionCondition))
		);
	const rows = await db
		.select()
		.from(schema.supplies)
		.where(
			and(
				opts.supplyId ? eq(schema.supplies.id, opts.supplyId) : undefined,
				opts.companionId
					? linked(eq(schema.supplyCompanions.companionId, opts.companionId))
					: undefined,
				opts.alertsOnly ? eq(schema.supplies.alertsEnabled, true) : undefined,
				opts.activeOnly ? linked(eq(schema.companions.isActive, true)) : undefined
			)
		)
		.orderBy(asc(schema.supplies.name), asc(schema.supplies.id));
	if (rows.length === 0) return [];
	const ids = rows.map((r) => r.id);

	const links = await db
		.select({
			supplyId: schema.supplyCompanions.supplyId,
			id: schema.companions.id,
			name: schema.companions.name,
			isActive: schema.companions.isActive
		})
		.from(schema.supplyCompanions)
		.innerJoin(schema.companions, eq(schema.companions.id, schema.supplyCompanions.companionId))
		.where(inArray(schema.supplyCompanions.supplyId, ids))
		.orderBy(asc(schema.companions.name), asc(schema.companions.id));
	const companionsBy = new Map<string, SupplySummary['companions']>();
	for (const { supplyId, ...c } of links) {
		const list = companionsBy.get(supplyId) ?? [];
		list.push(c);
		companionsBy.set(supplyId, list);
	}

	const series = await db
		.select({
			supplyId: schema.medications.supplyId,
			doseUnits: schema.medications.doseUnits,
			reminderId: schema.reminders.id,
			seriesId: schema.reminders.seriesId,
			unit: schema.reminders.recurrenceUnit,
			interval: schema.reminders.recurrenceInterval
		})
		.from(schema.reminders)
		.innerJoin(schema.medications, eq(schema.medications.id, schema.reminders.medicationId))
		.where(
			and(
				inArray(schema.medications.supplyId, ids),
				medicationActiveSql(opts.today),
				isNull(schema.reminders.completedAt),
				eq(schema.reminders.isRecurring, true)
			)
		);
	const seriesBy = new Map<string, Map<string, Parameters<typeof dailyUse>[0][number]>>();
	for (const r of series) {
		if (!r.supplyId || !r.unit) continue;
		const bySeries = seriesBy.get(r.supplyId) ?? new Map();
		bySeries.set(r.seriesId ?? r.reminderId, {
			doseUnits: r.doseUnits,
			unit: r.unit,
			interval: r.interval ?? 1
		});
		seriesBy.set(r.supplyId, bySeries);
	}

	return rows.map((r) => {
		const use = dailyUse([...(seriesBy.get(r.id)?.values() ?? [])]);
		const projection = projectRunOut(r, use, opts.today);
		const runOutLeads = parseLeadDays(r.runOutLeadDays);
		const expiryLeads = parseLeadDays(r.expiryLeadDays);
		const base = {
			id: r.id,
			name: r.name,
			kind: r.kind,
			unit: r.unit,
			quantity: r.quantity,
			lastsDays: r.lastsDays,
			stockedOn: r.stockedOn,
			expiresOn: r.expiresOn,
			alertsEnabled: r.alertsEnabled,
			lowStockAt: r.lowStockAt,
			runOutOn: projection?.runOutOn ?? null,
			daysLeft: projection?.daysLeft ?? null
		};
		return {
			...base,
			...supplyAttention(base, runOutLeads, expiryLeads, opts.today),
			companions: companionsBy.get(r.id) ?? [],
			stockVersion: r.stockVersion,
			runOutLeads,
			expiryLeads,
			runOutAlerted: r.runOutAlerted,
			lowAlerted: r.lowAlerted,
			expiryAlerted: r.expiryAlerted
		};
	});
}

const LEAD_ERROR_KEYS = {
	invalid: 'error.invalidLeadDays',
	tooMany: 'error.tooManyLeadDays',
	tooLong: 'error.leadDaysTooLong'
} as const satisfies Record<string, MessageKey>;

/** A count from 0 to MAX_SUPPLY_QUANTITY, as a decimal (`.` or `,`); null when blank. */
export function parseAmount(raw: unknown): number | null | 'invalid' | 'tooLarge' {
	const text = String(raw ?? '').trim();
	if (!text) return null;
	if (!/^(?:\d+(?:[.,]\d*)?|[.,]\d+)$/.test(text)) return 'invalid';
	const n = Number(text.replace(',', '.'));
	if (!Number.isFinite(n)) return 'invalid';
	return n > MAX_SUPPLY_QUANTITY ? 'tooLarge' : n;
}

/**
 * Parse the add/edit supply form. Fields:
 * - `name` (required, max 200), `kind` (`counted` | `duration`; edit forms
 *   post the existing kind as a hidden field, since `updateSupply` refuses a
 *   different one), `notes`, `expiresOn` (YYYY-MM-DD, optional).
 * - Counted: `unit` (max 50), `startingQuantity` (create only), `lowStockAt`;
 *   both decimals from 0 to MAX_SUPPLY_QUANTITY with `.` or `,`, blank for none.
 * - Duration: `lastsDays` (1-365, required).
 * - `firstPurchaseDate` (create only, optional, not in the future): duration,
 *   the first purchase; counted, when the starting stock was bought.
 * - `alertsEnabled`: checkbox, any value means on.
 * - `runOutLeadDays`, `expiryLeadDays`: the comma-joined text LeadDaysPicker
 *   posts; blank (every chip cleared) turns that warning off.
 * - `companionIds`: repeated, at least one.
 * Fields of the other kind are ignored.
 */
export function parseSupplyForm(
	data: FormData,
	today: string = localDateISO()
):
	| { ok: true; value: SupplyInput; companionIds: string[] }
	| { ok: false; error: MessageKey; vars?: Record<string, number> } {
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
	if (kind === 'counted') {
		if (exceedsLen(unit, MAX_SUPPLY_UNIT_LEN))
			return { ok: false, error: 'error.supplyUnitTooLong' };
		const start = parseAmount(data.get('startingQuantity'));
		const low = parseAmount(data.get('lowStockAt'));
		if (start === 'invalid' || low === 'invalid')
			return { ok: false, error: 'error.invalidQuantity' };
		if (start === 'tooLarge' || low === 'tooLarge')
			return { ok: false, error: 'error.quantityTooLarge', vars: { max: MAX_SUPPLY_QUANTITY } };
		startingQuantity = start;
		lowStockAt = low;
	} else {
		const lasts = text('lastsDays');
		if (!/^\d+$/.test(lasts) || Number(lasts) < 1 || Number(lasts) > MAX_LASTS_DAYS)
			return { ok: false, error: 'error.invalidLastsDays' };
		lastsDays = Number(lasts);
	}
	// Create only: when the starting stock was bought (counted: today when blank).
	const first = text('firstPurchaseDate');
	if (first && !isValidDate(first)) return { ok: false, error: 'error.invalidDate' };
	if (first > today) return { ok: false, error: 'error.purchaseInFuture' };
	const firstPurchaseDate = first || null;

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
