import { describe, it, expect } from 'vitest';
import {
	medicationReminderPrefillUrl,
	reminderAllowsLogEvent,
	reminderLogEventUrl
} from '#lib/health.js';

describe('medicationReminderPrefillUrl', () => {
	it('prefills a medication reminder linked to the medication', () => {
		const url = new URL(
			medicationReminderPrefillUrl('c1', { id: 'm 1', name: 'Carprofen', dose: '1 tablet' }),
			'http://x'
		);
		expect(url.pathname).toBe('/c1/reminders');
		expect(Object.fromEntries(url.searchParams)).toEqual({
			new: '1',
			title: 'Carprofen',
			type: 'medication',
			description: '1 tablet',
			medicationId: 'm 1'
		});
	});
	it('leaves the notes empty without a dose', () => {
		const url = medicationReminderPrefillUrl('c1', { id: 'm1', name: 'Chew', dose: null });
		expect(url).not.toContain('description=');
	});
});

describe('Log event for reminders', () => {
	const base = {
		companionId: 'c1',
		type: 'vet' as const,
		title: 'Checkup',
		description: null,
		medicationId: null
	};
	it('is offered for mapped types only when the reminder has no medication', () => {
		expect(reminderAllowsLogEvent(base)).toBe(true);
		expect(reminderAllowsLogEvent({ ...base, type: 'grooming' })).toBe(false);
		expect(reminderAllowsLogEvent({ type: 'medication', medicationId: 'm1' })).toBe(false);
		expect(reminderAllowsLogEvent({ type: 'medication', medicationId: null })).toBe(true);
	});
	it('has no follow-up URL for a medication-linked reminder', () => {
		expect(reminderLogEventUrl(base)).toBe('/c1/health?new=1&title=Checkup&type=vet_visit');
		expect(reminderLogEventUrl({ ...base, type: 'other' })).toBe('/c1/health?new=1&title=Checkup');
		expect(reminderLogEventUrl({ ...base, type: 'medication', medicationId: 'm1' })).toBeNull();
	});
});
