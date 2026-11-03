import { t, type Locale } from '#lib/i18n/index.js';
import { daysInMonth, parseYmd } from '#lib/date.js';

// Companion age from a "YYYY-MM-DD" dob, counted in whole calendar months and
// days (#398). Everything takes an explicit `today` (YYYY-MM-DD); nothing
// reads the clock. Null when there is no usable dob; callers pick the fallback.
export type AgeStyle = 'long' | 'short';

export interface AgeParts {
	years: number;
	months: number;
	days: number;
}

const DAY_MS = 24 * 60 * 60 * 1000;

const ymd = (y: number, m: number, d: number) =>
	`${String(y).padStart(4, '0')}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;

// The dob advanced n months, day clamped to the target month's length. Always
// computed from the dob, never from the previous anniversary.
function anniversary(b: { y: number; m: number; d: number }, n: number) {
	const idx = b.y * 12 + (b.m - 1) + n;
	const y = Math.floor(idx / 12);
	const m = (idx % 12) + 1;
	return { y, m, d: Math.min(b.d, daysInMonth(y, m)) };
}

export function ageParts(dob: string | null | undefined, today: string): AgeParts | null {
	const b = parseYmd(dob);
	const t0 = parseYmd(today);
	if (!b || !t0) return null;
	if (ymd(b.y, b.m, b.d) > ymd(t0.y, t0.m, t0.d)) return null;

	let n = (t0.y - b.y) * 12 + (t0.m - b.m);
	let a = anniversary(b, n);
	if (ymd(a.y, a.m, a.d) > ymd(t0.y, t0.m, t0.d)) {
		n -= 1;
		a = anniversary(b, n);
	}
	const days = Math.round(
		(Date.UTC(t0.y, t0.m - 1, t0.d, 12) - Date.UTC(a.y, a.m - 1, a.d, 12)) / DAY_MS
	);
	return { years: Math.floor(n / 12), months: n % 12, days };
}

export function formatAge(
	dob: string | null | undefined,
	locale: Locale,
	opts: { today: string; style?: AgeStyle; approximate?: boolean }
): string | null {
	const p = ageParts(dob, opts.today);
	if (!p) return null;
	const short = opts.style === 'short';

	if (opts.approximate) {
		if (p.years >= 1) {
			return t(locale, short ? 'age.approx.yearsShort' : 'age.approx.yearsOld', {
				count: p.years
			});
		}
		return t(locale, short ? 'age.approx.monthsShort' : 'age.approx.monthsOld', {
			count: Math.max(1, p.months)
		});
	}

	if (p.years >= 1) {
		if (short) return t(locale, 'age.yearsShort', { count: p.years });
		if (p.months > 0) return t(locale, 'age.yearsMonths', { years: p.years, months: p.months });
		return t(locale, p.years === 1 ? 'age.yearsOld.one' : 'age.yearsOld.other', {
			count: p.years
		});
	}
	if (p.months >= 1) {
		if (p.days > 0) {
			return t(locale, short ? 'age.monthsDaysShort' : 'age.monthsDaysOld', {
				months: p.months,
				days: p.days
			});
		}
		if (short) return t(locale, 'age.monthsShort', { count: p.months });
		return t(locale, p.months === 1 ? 'age.monthsOld.one' : 'age.monthsOld.other', {
			count: p.months
		});
	}
	return t(locale, short ? 'age.daysShort' : 'age.daysOld', { count: p.days });
}

// "2 years, 6 months, 12 days" with zero units dropped; a dob of today is "0 days".
export function formatFullAge(
	dob: string | null | undefined,
	locale: Locale,
	opts: { today: string }
): string | null {
	const p = ageParts(dob, opts.today);
	if (!p) return null;
	const unit = (u: 'years' | 'months' | 'days', count: number) =>
		t(locale, `age.unit.${u}.${count === 1 ? 'one' : 'other'}`, { count });
	const parts: string[] = [];
	if (p.years > 0) parts.push(unit('years', p.years));
	if (p.months > 0) parts.push(unit('months', p.months));
	if (p.days > 0) parts.push(unit('days', p.days));
	if (parts.length === 0) parts.push(unit('days', 0));
	return new Intl.ListFormat(locale, { type: 'unit', style: 'long' }).format(parts);
}
