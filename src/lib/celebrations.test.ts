import { describe, it, expect } from 'vitest';
import { SUPPORTED_LOCALES } from './i18n/index.js';
import {
	celebrationOn,
	celebrationBanner,
	celebrationLines,
	celebrationParts,
	dismissToken,
	type CelebrationInput
} from './celebrations.js';

const base = { dob: null, dobApproximate: false, homecomingDate: null, isActive: true };

describe('celebrationOn', () => {
	it('monthly milestones in the first year, exact dob only', () => {
		const c = { ...base, dob: '2026-01-15' };
		expect(celebrationOn(c, '2026-02-15')).toEqual({ birthdayMonths: 1 });
		expect(celebrationOn(c, '2026-12-15')).toEqual({ birthdayMonths: 11 });
		expect(celebrationOn(c, '2027-01-15')).toEqual({ birthdayYears: 1 });
		expect(celebrationOn(c, '2026-01-15')).toBeNull();
		expect(celebrationOn(c, '2026-02-16')).toBeNull();
		expect(celebrationOn({ ...c, dobApproximate: true }, '2026-02-15')).toBeNull();
		expect(celebrationOn({ ...c, isActive: false }, '2026-02-15')).toBeNull();
		expect(celebrationOn({ ...base, dob: '2026-03-15' }, '2026-02-15')).toBeNull();
	});
	it('late-month dob celebrates on the last day of shorter months', () => {
		const c = { ...base, dob: '2027-01-31' };
		expect(celebrationOn(c, '2027-02-28')).toEqual({ birthdayMonths: 1 });
		expect(celebrationOn(c, '2027-03-31')).toEqual({ birthdayMonths: 2 });
		expect(celebrationOn(c, '2027-03-28')).toBeNull();
		expect(celebrationOn(c, '2027-04-30')).toEqual({ birthdayMonths: 3 });
		const leap = { ...base, dob: '2028-01-31' };
		expect(celebrationOn(leap, '2028-02-29')).toEqual({ birthdayMonths: 1 });
		expect(celebrationOn(leap, '2028-02-28')).toBeNull();
		expect(celebrationOn({ ...base, dob: '2027-01-30' }, '2027-02-28')).toEqual({
			birthdayMonths: 1
		});
	});
	it('monthly milestone and homecoming on the same day', () => {
		const c = { ...base, dob: '2026-01-04', homecomingDate: '2025-03-04' };
		expect(celebrationOn(c, '2026-03-04')).toEqual({ birthdayMonths: 2, homecomingYears: 1 });
	});
	it('homecoming anniversary', () => {
		const c = { ...base, homecomingDate: '2019-03-04' };
		expect(celebrationOn(c, '2026-03-04')).toEqual({ homecomingYears: 7 });
		expect(celebrationOn(c, '2019-03-04')).toBeNull();
		expect(celebrationOn(c, '2026-03-05')).toBeNull();
	});
	it('exact dob birthday, not approximate', () => {
		const c = { ...base, dob: '2018-03-04' };
		expect(celebrationOn(c, '2026-03-04')).toEqual({ birthdayYears: 8 });
		expect(celebrationOn({ ...c, dobApproximate: true }, '2026-03-04')).toBeNull();
	});
	it('both on the same day', () => {
		const c = { ...base, dob: '2018-03-04', homecomingDate: '2019-03-04' };
		expect(celebrationOn(c, '2026-03-04')).toEqual({ birthdayYears: 8, homecomingYears: 7 });
	});
	it('Feb 29 falls on Feb 28 in non-leap years', () => {
		const c = { ...base, homecomingDate: '2020-02-29' };
		expect(celebrationOn(c, '2025-02-28')).toEqual({ homecomingYears: 5 });
		expect(celebrationOn(c, '2025-03-01')).toBeNull();
		expect(celebrationOn(c, '2028-02-29')).toEqual({ homecomingYears: 8 });
		expect(celebrationOn(c, '2028-02-28')).toBeNull();
	});
	it('inactive is null', () => {
		expect(
			celebrationOn({ ...base, homecomingDate: '2019-03-04', isActive: false }, '2026-03-04')
		).toBeNull();
	});
	it('malformed or future dob gives no birthday', () => {
		expect(celebrationOn({ ...base, dob: 'junk' }, '2026-03-04')).toBeNull();
		expect(celebrationOn({ ...base, dob: '2027-03-04' }, '2026-03-04')).toBeNull();
	});
});

describe('celebrationBanner', () => {
	const mk = (id: string): CelebrationInput => ({
		...base,
		id,
		name: id,
		avatarPath: null,
		homecomingDate: '2019-03-04'
	});
	const today = '2026-03-04';
	it('returns entries', () => {
		expect(celebrationBanner([mk('a')], today, undefined)).toEqual([
			{ companionId: 'a', name: 'a', avatarPath: null, homecomingYears: 7 }
		]);
	});
	it('drops dismissed, keeps others', () => {
		const cookie = dismissToken('a', today);
		const out = celebrationBanner([mk('a'), mk('b')], today, cookie);
		expect(out.map((e) => e.companionId)).toEqual(['b']);
	});
	it('tolerates encoding, whitespace, and empty cookie', () => {
		const enc = encodeURIComponent(`x:1, ${dismissToken('a', today)}`);
		expect(celebrationBanner([mk('a')], today, enc)).toEqual([]);
		expect(celebrationBanner([mk('a')], today, ` ${dismissToken('a', today)} `)).toEqual([]);
		expect(celebrationBanner([mk('a')], today, '')).toHaveLength(1);
	});
	it('ignores yesterday token', () => {
		expect(celebrationBanner([mk('a')], today, dismissToken('a', '2026-03-03'))).toHaveLength(1);
	});
});

describe('celebrationLines', () => {
	it('renders the monthly line before homecoming, singular and plural', () => {
		expect(celebrationLines('en', 'Sky', { birthdayMonths: 4, homecomingYears: 1 })).toEqual([
			'🎉 Sky is 4 months old today!',
			"🏡 Sky's homecoming day: 1 year home!"
		]);
		expect(celebrationLines('en', 'Sky', { birthdayMonths: 1 })).toEqual([
			'🎉 Sky is 1 month old today!'
		]);
	});
	it('renders birthday then homecoming', () => {
		expect(celebrationLines('en', 'Ein', { birthdayYears: 8, homecomingYears: 7 })).toEqual([
			'🎂 Ein turns 8 today!',
			"🏡 Ein's homecoming day: 7 years home!"
		]);
	});

	it('uses the singular homecoming line for one year', () => {
		expect(celebrationLines('en', 'Ein', { homecomingYears: 1 })).toEqual([
			"🏡 Ein's homecoming day: 1 year home!"
		]);
	});
});

describe('celebrationParts', () => {
	it('keeps the icon out of the text, birthday first', () => {
		expect(celebrationParts('en', 'Ein', { birthdayYears: 8, homecomingYears: 7 })).toEqual([
			{ icon: '🎂', text: 'Ein turns 8 today!' },
			{ icon: '🏡', text: "Ein's homecoming day: 7 years home!" }
		]);
	});

	it('has no emoji in any locale string', () => {
		for (const locale of SUPPORTED_LOCALES) {
			for (const c of [
				{ birthdayYears: 1, homecomingYears: 2 },
				{ birthdayMonths: 1 },
				{ birthdayMonths: 3 }
			]) {
				for (const part of celebrationParts(locale, 'Ein', c)) {
					expect(part.text).not.toMatch(/\p{Extended_Pictographic}/u);
				}
			}
		}
	});
});
