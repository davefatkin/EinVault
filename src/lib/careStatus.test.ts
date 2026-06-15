import { describe, it, expect } from 'vitest';
import { careStatus } from './careStatus';

const NOW = new Date('2026-06-12T12:00:00Z');
function rem(dueAt: string, completedAt: Date | null = null) {
	return { dueAt: new Date(dueAt), completedAt };
}

describe('careStatus', () => {
	it('up-to-date when no overdue/today reminders', () => {
		expect(careStatus([rem('2026-06-20T12:00:00Z')], NOW)).toBe('up-to-date');
	});
	it('up-to-date with no reminders at all', () => {
		expect(careStatus([], NOW)).toBe('up-to-date');
	});
	it('due-today when a reminder is due later today', () => {
		expect(careStatus([rem('2026-06-12T18:00:00Z')], NOW)).toBe('due-today');
	});
	it('needs-attention when a reminder is overdue (past)', () => {
		expect(careStatus([rem('2026-06-10T09:00:00Z')], NOW)).toBe('needs-attention');
	});
	it('overdue takes priority over due-today', () => {
		expect(careStatus([rem('2026-06-12T18:00:00Z'), rem('2026-06-09T09:00:00Z')], NOW)).toBe(
			'needs-attention'
		);
	});
	it('ignores completed reminders', () => {
		expect(careStatus([rem('2026-06-09T09:00:00Z', new Date())], NOW)).toBe('up-to-date');
	});
});
