import { describe, it, expect } from 'vitest';
import {
	doseCovered,
	formatMedicationSchedule,
	medicationEndState,
	todayInZone,
	isMedicationActive,
	ownerMedicationCaps,
	withCurrentSupply,
	type MedicationScheduleItem
} from '#lib/medications.js';

describe('isMedicationActive', () => {
	it('is active without an end date', () => {
		expect(isMedicationActive(null, '2026-11-09')).toBe(true);
	});
	it('is active on the end date itself (inclusive)', () => {
		expect(isMedicationActive('2026-11-09', '2026-11-09')).toBe(true);
	});
	it('is active before the end date', () => {
		expect(isMedicationActive('2026-11-10', '2026-11-09')).toBe(true);
	});
	it('is ended after the end date', () => {
		expect(isMedicationActive('2026-11-08', '2026-11-09')).toBe(false);
	});
});

describe('formatMedicationSchedule', () => {
	const item = (unit: 'day' | 'month', hour: number, over: Partial<MedicationScheduleItem> = {}) =>
		({
			unit,
			interval: 1,
			anchor: unit === 'month' ? 'day_of_month' : 'interval',
			anchorValue: unit === 'month' ? 1 : null,
			dueAt: new Date(Date.UTC(2030, 0, hour < 12 ? 2 : 1, hour, 0)),
			...over
		}) satisfies MedicationScheduleItem;

	it('groups series by recurrence and sorts times by time of day', () => {
		expect(formatMedicationSchedule([item('day', 20), item('day', 8)], 'en', 'UTC')).toBe(
			'Every day at 8:00 AM and 8:00 PM'
		);
	});
	it('joins different recurrences', () => {
		expect(formatMedicationSchedule([item('day', 8), item('month', 9)], 'en', 'UTC')).toBe(
			'Every day at 8:00 AM; Every 1 month(s) on day 1 at 9:00 AM'
		);
	});
	it('drops duplicate times and is empty without series', () => {
		expect(formatMedicationSchedule([item('day', 8), item('day', 8)], 'en', 'UTC')).toBe(
			'Every day at 8:00 AM'
		);
		expect(formatMedicationSchedule([], 'en', 'UTC')).toBe('');
	});
	it('uses the household time zone', () => {
		expect(formatMedicationSchedule([item('day', 13)], 'en', 'America/New_York')).toBe(
			'Every day at 8:00 AM'
		);
	});
});

describe('ownerMedicationCaps', () => {
	it('allows everything on an active companion and nothing on an archived one', () => {
		expect(ownerMedicationCaps(true)).toEqual({ canLogDose: true, canEdit: true });
		expect(ownerMedicationCaps(false)).toEqual({ canLogDose: false, canEdit: false });
	});
});

describe('medicationEndState', () => {
	const today = '2026-11-09';
	it('labels the end date by whether it is later, today, or past', () => {
		expect(medicationEndState({ active: true, endedOn: null }, today)).toBeNull();
		expect(medicationEndState({ active: true, endedOn: '2026-11-12' }, today)).toBe('endsOn');
		expect(medicationEndState({ active: true, endedOn: today }, today)).toBe('endsToday');
		expect(medicationEndState({ active: false, endedOn: '2026-11-08' }, today)).toBe('endedOn');
	});
});

describe('todayInZone', () => {
	it('reads the calendar date in the given zone', () => {
		const now = new Date(Date.UTC(2026, 10, 9, 2, 30));
		expect(todayInZone('UTC', now)).toBe('2026-11-09');
		expect(todayInZone('America/New_York', now)).toBe('2026-11-08');
	});
});

describe('doseCovered', () => {
	const utc = (d: number, h: number, m = 0) => new Date(Date.UTC(2026, 10, d, h, m));
	const now = utc(9, 8, 10);
	const given = (at: Date) => ({ at });

	it('is false before any dose', () => {
		expect(doseCovered({ lastGiven: null, nextDueAt: utc(9, 20) }, now, 'UTC')).toBe(false);
		expect(doseCovered({ lastGiven: null, nextDueAt: null }, now, 'UTC')).toBe(false);
	});

	it('stays covered until the next dose reminder is within 3 hours', () => {
		const med = { lastGiven: given(utc(9, 8, 5)), nextDueAt: utc(9, 20) };
		expect(doseCovered(med, now, 'UTC')).toBe(true);
		expect(doseCovered(med, utc(9, 16, 59), 'UTC')).toBe(true);
		expect(doseCovered(med, utc(9, 17), 'UTC')).toBe(false);
	});

	it("stays covered when the next reminder is within 3 hours but past midnight, which a tap can't reach", () => {
		const med = { lastGiven: given(utc(9, 20)), nextDueAt: utc(10, 0, 30) };
		expect(doseCovered(med, utc(9, 22, 30), 'UTC')).toBe(true);
		expect(doseCovered(med, utc(10, 0, 1), 'UTC')).toBe(false);
	});

	it('is not covered while a dose reminder is overdue', () => {
		const med = { lastGiven: given(utc(8, 8)), nextDueAt: utc(9, 8) };
		expect(doseCovered(med, now, 'UTC')).toBe(false);
	});

	it('without an open reminder, is covered for the rest of the day given', () => {
		const med = { lastGiven: given(utc(9, 7)), nextDueAt: null };
		expect(doseCovered(med, now, 'UTC')).toBe(true);
		expect(doseCovered(med, utc(9, 23, 59), 'UTC')).toBe(true);
		expect(doseCovered(med, utc(10, 0, 1), 'UTC')).toBe(false);
	});

	it('uses the household time zone for the day', () => {
		// 03:00 UTC on the 10th is still the 9th in New York.
		const med = { lastGiven: given(utc(9, 20)), nextDueAt: null };
		expect(doseCovered(med, utc(10, 3), 'America/New_York')).toBe(true);
		expect(doseCovered(med, utc(10, 3), 'UTC')).toBe(false);
	});
});

describe('withCurrentSupply', () => {
	const options = [{ id: 's1', name: 'Carprofen', unit: 'tablets' }];
	const current = { id: 's2', name: 'Old bottle', quantity: 4, unit: null, daysLeft: null };
	it('keeps a supply the pet no longer has as an option marked unlinked', () => {
		expect(withCurrentSupply(options, current)).toEqual([
			...options,
			{ id: 's2', name: 'Old bottle', unit: null, unlinked: true }
		]);
	});
	it('leaves the options alone when the supply is offered or there is none', () => {
		expect(withCurrentSupply(options, { ...current, id: 's1' })).toBe(options);
		expect(withCurrentSupply(options, null)).toBe(options);
	});
});
