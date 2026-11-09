import { describe, it, expect } from 'vitest';
import {
	formatMedicationSchedule,
	medicationEndState,
	todayInZone,
	isMedicationActive,
	ownerMedicationCaps,
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
