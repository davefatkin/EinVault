import { describe, it, expect } from 'vitest';
import { reminderBuckets, reminderUrgency, type BucketableReminder } from './reminderBuckets';

const R = (id: string, dueAt: string): BucketableReminder => ({ id, dueAt: new Date(dueAt) });
const now = new Date('2026-06-12T12:00:00');

describe('reminderBuckets', () => {
	it('puts past-due reminders in overdue', () => {
		const { overdue, today, upcoming } = reminderBuckets([R('a', '2026-06-10T09:00:00')], now);
		expect(overdue.map((r) => r.id)).toEqual(['a']);
		expect(today).toEqual([]);
		expect(upcoming).toEqual([]);
	});
	it('puts same-local-day not-yet-past reminders in today', () => {
		const { today } = reminderBuckets([R('a', '2026-06-12T18:00:00')], now);
		expect(today.map((r) => r.id)).toEqual(['a']);
	});
	it('a today reminder whose time already passed is overdue', () => {
		const { overdue, today } = reminderBuckets([R('a', '2026-06-12T09:00:00')], now);
		expect(overdue.map((r) => r.id)).toEqual(['a']);
		expect(today).toEqual([]);
	});
	it('puts future-day reminders in upcoming', () => {
		const { upcoming } = reminderBuckets([R('a', '2026-06-20T09:00:00')], now);
		expect(upcoming.map((r) => r.id)).toEqual(['a']);
	});
	it('sorts each bucket ascending by dueAt', () => {
		const { upcoming } = reminderBuckets(
			[R('b', '2026-06-25T09:00:00'), R('a', '2026-06-20T09:00:00')],
			now
		);
		expect(upcoming.map((r) => r.id)).toEqual(['a', 'b']);
	});
	it('returns empty buckets for empty input', () => {
		const { overdue, today, upcoming } = reminderBuckets([], now);
		expect(overdue).toEqual([]);
		expect(today).toEqual([]);
		expect(upcoming).toEqual([]);
	});
});

describe('reminderUrgency', () => {
	it('classifies a past due date as overdue', () => {
		expect(reminderUrgency(new Date('2026-06-10T09:00:00'), now)).toBe('overdue');
	});
	it('classifies a same-day earlier time as overdue', () => {
		expect(reminderUrgency(new Date('2026-06-12T09:00:00'), now)).toBe('overdue');
	});
	it('classifies later today as today', () => {
		expect(reminderUrgency(new Date('2026-06-12T18:00:00'), now)).toBe('today');
	});
	it('classifies the next local day as tomorrow', () => {
		expect(reminderUrgency(new Date('2026-06-13T00:30:00'), now)).toBe('tomorrow');
	});
	it('classifies two days out as upcoming, not tomorrow', () => {
		expect(reminderUrgency(new Date('2026-06-14T09:00:00'), now)).toBe('upcoming');
	});
	it('classifies five days out as upcoming (issue #228)', () => {
		expect(reminderUrgency(new Date('2026-06-17T09:00:00'), now)).toBe('upcoming');
	});
	it('handles the tomorrow check across a month boundary', () => {
		const eom = new Date('2026-06-30T12:00:00');
		expect(reminderUrgency(new Date('2026-07-01T09:00:00'), eom)).toBe('tomorrow');
		expect(reminderUrgency(new Date('2026-07-02T09:00:00'), eom)).toBe('upcoming');
	});
});
