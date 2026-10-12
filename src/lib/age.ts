import { t, type Locale } from '$lib/i18n';

// Companion age from a "YYYY-MM-DD" dob (#280), replacing three English-only
// page helpers and keeping their two formats:
// - 'long' (care page, companion overview, caretaker sheet): calendar months
//   under a year, then years plus leftover months.
// - 'short' (dashboard cards): whole years since the last birthday, or 30-day
//   months under a year.
// Null when there is no usable dob; callers pick the fallback.
export type AgeStyle = 'long' | 'short';

const DAY_MS = 24 * 60 * 60 * 1000;

// A date-only string is a local calendar date. new Date('YYYY-MM-DD') would
// read UTC midnight, which is the evening before west of UTC.
function parseDob(dob: string): Date | null {
	const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dob);
	const d = m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : new Date(dob);
	return isNaN(d.getTime()) ? null : d;
}

export function formatAge(
	dob: string | null | undefined,
	locale: Locale,
	opts: { style?: AgeStyle; now?: Date } = {}
): string | null {
	if (!dob) return null;
	const born = parseDob(dob);
	if (!born) return null;
	const now = opts.now ?? new Date();

	if (opts.style === 'short') {
		const years = now.getFullYear() - born.getFullYear();
		const beforeBirthday = now < new Date(now.getFullYear(), born.getMonth(), born.getDate());
		const whole = beforeBirthday ? years - 1 : years;
		if (whole < 1) {
			const count = Math.floor((now.getTime() - born.getTime()) / (30 * DAY_MS));
			return t(locale, 'age.monthsShort', { count });
		}
		return t(locale, 'age.yearsShort', { count: whole });
	}

	const months = (now.getFullYear() - born.getFullYear()) * 12 + now.getMonth() - born.getMonth();
	if (months < 12) {
		return t(locale, months === 1 ? 'age.monthsOld.one' : 'age.monthsOld.other', {
			count: months
		});
	}
	const years = Math.floor(months / 12);
	const rest = months % 12;
	if (rest > 0) return t(locale, 'age.yearsMonths', { years, months: rest });
	return t(locale, years === 1 ? 'age.yearsOld.one' : 'age.yearsOld.other', { count: years });
}
