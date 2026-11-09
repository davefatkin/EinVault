import { t, type Locale } from '#lib/i18n/index.js';

export const LEAD_DAY_PRESETS = [1, 2, 3, 7, 14, 30] as const;
export const MAX_LEAD_TIMES = 3;
export const MAX_LEAD_DAYS = 90;

type Unit = 'day' | 'week' | 'month' | 'year';

const UNIT_DAYS: Record<Unit, number> = { day: 1, week: 7, month: 28, year: 365 };

function isValidLead(n: number): boolean {
	return Number.isInteger(n) && n >= 1 && n <= MAX_LEAD_DAYS;
}

function canonical(days: readonly number[]): number[] {
	return [...new Set(days)].sort((a, b) => b - a);
}

/** Tolerant read of the stored text: drops junk, returns distinct values, descending. */
export function parseLeadDays(text: string | null | undefined): number[] {
	if (!text) return [];
	const out: number[] = [];
	for (const part of text.split(',')) {
		const s = part.trim();
		if (!/^\d+$/.test(s)) continue;
		const n = Number(s);
		if (isValidLead(n)) out.push(n);
	}
	return canonical(out);
}

/** Canonical stored form: distinct, descending, comma-joined; empty is null. */
export function serializeLeadDays(days: readonly number[]): string | null {
	const c = canonical(days);
	return c.length ? c.join(',') : null;
}

export function repeatPeriodDays(unit: Unit, interval: number): number {
	return UNIT_DAYS[unit] * interval;
}

export function validateLeadDays(
	raw: string,
	recurrence: { unit: Unit; interval: number } | null
): { ok: true; value: string | null } | { ok: false; reason: 'invalid' | 'tooMany' | 'tooLong' } {
	const text = raw.trim();
	if (!text) return { ok: true, value: null };
	const nums: number[] = [];
	for (const part of text.split(',')) {
		const s = part.trim();
		if (!/^\d+$/.test(s)) return { ok: false, reason: 'invalid' };
		const n = Number(s);
		if (!isValidLead(n)) return { ok: false, reason: 'invalid' };
		nums.push(n);
	}
	if (new Set(nums).size !== nums.length) return { ok: false, reason: 'invalid' };
	if (nums.length > MAX_LEAD_TIMES) return { ok: false, reason: 'tooMany' };
	if (recurrence) {
		const period = repeatPeriodDays(recurrence.unit, recurrence.interval);
		if (nums.some((n) => n >= period)) return { ok: false, reason: 'tooLong' };
	}
	return { ok: true, value: serializeLeadDays(nums) };
}

/** `dueAt` moved back `days` local calendar days, keeping the local wall time. */
export function leadTime(dueAt: Date, days: number): Date {
	const d = new Date(dueAt.getTime());
	d.setDate(d.getDate() - days);
	return d;
}

/** Local calendar days from `now` to `dueAt` (0 = same local day). */
export function daysUntil(dueAt: Date, now: Date): number {
	const a = Date.UTC(dueAt.getFullYear(), dueAt.getMonth(), dueAt.getDate());
	const b = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
	return Math.round((a - b) / 86_400_000);
}

export function formatLeadDays(locale: Locale, days: readonly number[]): string {
	const c = canonical(days);
	if (!c.length) return '';
	const parts = c.map((n) =>
		t(locale, n === 1 ? 'page.reminders.leadDay' : 'page.reminders.leadDays', { count: n })
	);
	const list =
		parts.length === 1
			? parts[0]
			: `${parts.slice(0, -1).join(', ')} ${t(locale, 'page.reminders.leadAnd')} ${parts[parts.length - 1]}`;
	return t(locale, 'page.reminders.leadSummary', { list });
}
