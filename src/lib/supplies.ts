import { t, type Locale } from '#lib/i18n/index.js';
import { addDaysYmd, daysBetweenYmd } from '#lib/date.js';
import { repeatPeriodDays } from '#lib/reminderLeadTimes.js';

export type SupplyKind = 'counted' | 'duration';

type Unit = 'day' | 'week' | 'month' | 'year';

/** A run-out further out than this (about ten years) projects as this many days. */
export const MAX_PROJECTION_DAYS = 3650;

export const MAX_SUPPLY_NAME_LEN = 200;
export const MAX_SUPPLY_UNIT_LEN = 50;
export const MAX_LASTS_DAYS = 365;
/** Largest starting, purchased, corrected or low-stock count. */
export const MAX_SUPPLY_QUANTITY = 100_000;
/** Units one dose takes from its supply: a plain decimal in this range. */
export const MIN_DOSE_UNITS = 0.01;
export const MAX_DOSE_UNITS = 1000;

/** Units used per day across recurring dose series: sum of doseUnits / period. */
export function dailyUse(series: { doseUnits: number; unit: Unit; interval: number }[]): number {
	let total = 0;
	for (const s of series) total += s.doseUnits / repeatPeriodDays(s.unit, s.interval);
	return total;
}

/**
 * Projects when a supply runs out. Counted supplies need a schedule (dailyUse > 0);
 * duration supplies need a purchase date. daysLeft is never below 0, and a
 * span past MAX_PROJECTION_DAYS is capped there so the date stays a real one.
 */
export function projectRunOut(
	s: {
		kind: SupplyKind;
		quantity: number | null;
		lastsDays: number | null;
		stockedOn: string | null;
	},
	dailyUse: number,
	today: string
): { runOutOn: string; daysLeft: number } | null {
	const cap = (days: number) =>
		Number.isFinite(days) ? Math.min(days, MAX_PROJECTION_DAYS) : MAX_PROJECTION_DAYS;
	let runOutOn: string;
	if (s.kind === 'counted') {
		if (s.quantity === null || !(dailyUse > 0)) return null;
		runOutOn = addDaysYmd(today, cap(Math.max(0, Math.floor(s.quantity / dailyUse))));
	} else {
		if (!s.stockedOn || s.lastsDays === null) return null;
		runOutOn = addDaysYmd(s.stockedOn, cap(s.lastsDays));
	}
	return { runOutOn, daysLeft: Math.max(0, daysBetweenYmd(today, runOutOn)) };
}

/** The smallest lead that already covers daysUntil (daysUntil <= lead), else null. */
export function shortestEligibleLead(leads: number[], daysUntil: number): number | null {
	let best: number | null = null;
	for (const n of leads) if (daysUntil <= n && (best === null || n < best)) best = n;
	return best;
}

export function isLowStock(quantity: number | null, lowStockAt: number | null): boolean {
	return quantity !== null && lowStockAt !== null && quantity <= lowStockAt;
}

export type SupplySummary = {
	id: string;
	name: string;
	kind: SupplyKind;
	unit: string | null;
	quantity: number | null;
	lastsDays: number | null;
	stockedOn: string | null;
	expiresOn: string | null;
	alertsEnabled: boolean;
	lowStockAt: number | null;
	runOutOn: string | null;
	daysLeft: number | null;
	runningLow: boolean;
	expiring: boolean;
	/** Expiring with the date already past: badged "Expired". */
	expired: boolean;
	companions: { id: string; name: string; isActive: boolean }[];
};

/**
 * Which badges a supply earns today, independent of alertsEnabled. An empty
 * counted supply is running low even with no schedule or low-stock count.
 * `expired` is the part of `expiring` whose date has already passed.
 */
export function supplyAttention(
	s: Pick<SupplySummary, 'kind' | 'quantity' | 'lowStockAt' | 'expiresOn' | 'daysLeft'>,
	runOutLeads: number[],
	expiryLeads: number[],
	today: string
): { runningLow: boolean; expiring: boolean; expired: boolean } {
	const outCounted = s.kind === 'counted' && s.quantity !== null && s.quantity <= 0;
	const runningLow =
		outCounted ||
		isLowStock(s.quantity, s.lowStockAt) ||
		(s.daysLeft !== null &&
			(s.daysLeft === 0 || shortestEligibleLead(runOutLeads, s.daysLeft) !== null));
	// A counted supply at 0 is out, not expiring.
	const daysToExpiry = s.expiresOn === null ? null : daysBetweenYmd(today, s.expiresOn);
	const expiring =
		!outCounted &&
		daysToExpiry !== null &&
		shortestEligibleLead(expiryLeads, daysToExpiry) !== null;
	return { runningLow, expiring, expired: expiring && daysToExpiry! < 0 };
}

/** "Out", "about N days left", or "about N weeks left" from 14 days. */
export function formatRunOut(locale: Locale, daysLeft: number): string {
	if (daysLeft <= 0) return t(locale, 'supply.runOut.out');
	if (daysLeft < 14)
		return t(locale, daysLeft === 1 ? 'supply.runOut.day' : 'supply.runOut.days', {
			count: daysLeft
		});
	return t(locale, 'supply.runOut.weeks', { count: Math.floor(daysLeft / 7) });
}

/** "One lasts about 1 day" or "One lasts about 30 days". */
export function formatLastsDays(locale: Locale, days: number): string {
	return t(locale, days === 1 ? 'page.supplies.lastsDay' : 'page.supplies.lastsDays', {
		count: days
	});
}

/** A count for display: up to two decimals (half tablets), locale digits. */
export function formatAmount(locale: Locale, n: number, signed = false): string {
	return new Intl.NumberFormat(locale, {
		maximumFractionDigits: 2,
		...(signed ? { signDisplay: 'exceptZero' as const } : {})
	}).format(n);
}

/** formatRunOut after a count: "about N days", "about N weeks", "runs out today". */
function formatRunOutAfterCount(locale: Locale, daysLeft: number): string {
	if (daysLeft <= 0) return t(locale, 'supply.runOutShort.today');
	if (daysLeft < 14)
		return t(locale, daysLeft === 1 ? 'supply.runOutShort.day' : 'supply.runOutShort.days', {
			count: daysLeft
		});
	return t(locale, 'supply.runOutShort.weeks', { count: Math.floor(daysLeft / 7) });
}

/** "42 tablets left · about 3 weeks", "about 12 days left" or "Not bought yet". */
export function supplyStockLine(
	locale: Locale,
	s: Pick<SupplySummary, 'kind' | 'quantity' | 'unit' | 'daysLeft'>
): string {
	if (s.kind === 'duration')
		return s.daysLeft === null
			? t(locale, 'supply.notBoughtYet')
			: formatRunOut(locale, s.daysLeft);
	const quantity = s.quantity ?? 0;
	const count = formatAmount(locale, quantity);
	const left = s.unit
		? t(locale, 'supply.countLeft', { count, unit: s.unit })
		: t(locale, 'supply.countLeftNoUnit', { count });
	// Nothing left says it all; a projection would only repeat it.
	if (s.daysLeft === null || quantity <= 0) return left;
	return `${left} · ${formatRunOutAfterCount(locale, s.daysLeft)}`;
}

/** A pet the add/edit form offers: active ones, plus archived ones already linked. */
export type SupplyCompanionOption = { id: string; name: string; isActive: boolean };

/** What the add/edit form shows, and what a failed save sends back. */
export type SupplyFormValues = {
	name: string;
	kind: string;
	unit: string;
	startingQuantity: string;
	lastsDays: string;
	firstPurchaseDate: string;
	expiresOn: string;
	alertsEnabled: boolean;
	runOutLeadDays: number[];
	expiryLeadDays: number[];
	lowStockAt: string;
	notes: string;
	companionIds: string[];
};

/** One row of a supply's history, newest first. */
export type SupplyEventView = {
	id: string;
	type: 'purchase' | 'use' | 'correction';
	at: Date;
	quantityDelta: number | null;
	costMinor: number | null;
	currency: string | null;
	note: string | null;
	/** The pet on a use event. */
	companionName: string | null;
	createdBy: string | null;
	receipt: { url: string; title: string } | null;
};
