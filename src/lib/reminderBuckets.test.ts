import { describe, it, expect } from 'vitest';
import { reminderBuckets, type BucketableReminder } from './reminderBuckets';

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
});
