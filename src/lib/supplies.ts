import { t, type Locale } from '#lib/i18n/index.js';
import { addDaysYmd, daysBetweenYmd } from '#lib/date.js';
import { repeatPeriodDays } from '#lib/reminderLeadTimes.js';

export type SupplyKind = 'counted' | 'duration';

type Unit = 'day' | 'week' | 'month' | 'year';

/** Units used per day across recurring dose series: sum of doseUnits / period. */
export function dailyUse(series: { doseUnits: number; unit: Unit; interval: number }[]): number {
	let total = 0;
	for (const s of series) total += s.doseUnits / repeatPeriodDays(s.unit, s.interval);
	return total;
}

/**
 * Projects when a supply runs out. Counted supplies need a schedule (dailyUse > 0);
 * duration supplies need a purchase date. daysLeft is never below 0.
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
	let runOutOn: string;
	if (s.kind === 'counted') {
		if (s.quantity === null || !(dailyUse > 0)) return null;
		runOutOn = addDaysYmd(today, Math.floor(s.quantity / dailyUse));
	} else {
		if (!s.stockedOn || s.lastsDays === null) return null;
		runOutOn = addDaysYmd(s.stockedOn, s.lastsDays);
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
	companions: { id: string; name: string; isActive: boolean }[];
};

/** Which badges a supply earns today, independent of alertsEnabled. */
export function supplyAttention(
	s: Pick<SupplySummary, 'kind' | 'quantity' | 'lowStockAt' | 'expiresOn' | 'daysLeft'>,
	runOutLeads: number[],
	expiryLeads: number[],
	today: string
): { runningLow: boolean; expiring: boolean } {
	const runningLow =
		s.daysLeft !== null &&
		(s.daysLeft === 0 || shortestEligibleLead(runOutLeads, s.daysLeft) !== null);
	const low = runningLow || isLowStock(s.quantity, s.lowStockAt);
	// A counted supply at 0 is out, not expiring.
	const outCounted = s.kind === 'counted' && s.quantity !== null && s.quantity <= 0;
	const expiring =
		!outCounted &&
		s.expiresOn !== null &&
		shortestEligibleLead(expiryLeads, daysBetweenYmd(today, s.expiresOn)) !== null;
	return { runningLow: low, expiring };
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
