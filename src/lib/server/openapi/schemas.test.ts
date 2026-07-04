import { describe, it, expect } from 'vitest';
import {
	toApiDailyEvent,
	toApiJournalEntry,
	toApiQuickLog,
	toApiCompanion,
	toApiCompanionMinimal
} from '$lib/server/api-serializers';
import { LoggedEvent, JournalEntry, QuickLog, Companion } from './schemas';

// Drift guard: the OpenAPI response schemas above are hand-maintained, not
// derived from the serializers, so nothing stops them from diverging from
// what a handler actually returns. This test builds one sample row per
// serializer and asserts the serialized keys exactly match the schema's
// declared keys (or, for the write-scope-minimal companion shape, that every
// key it returns is a subset of the full schema). PR2-4 extend this test as
// they add health/weight/reminder/user serializers.

describe('response schemas match their serializers', () => {
	it('toApiDailyEvent output keys match LoggedEvent.shape', () => {
		const row = {
			id: 'evt-1',
			companionId: 'comp-1',
			type: 'walk' as const,
			notes: 'a note',
			durationMinutes: 15,
			loggedAt: new Date(),
			createdAt: new Date(),
			loggedBy: 'user-1',
			eventGroupId: 'grp-1'
		};
		const result = toApiDailyEvent(row);
		expect(Object.keys(result).sort()).toEqual(Object.keys(LoggedEvent.shape).sort());
	});

	it('toApiJournalEntry output keys match JournalEntry.shape', () => {
		const row = {
			id: 'jrn-1',
			companionId: 'comp-1',
			date: '2026-07-04',
			body: 'entry text',
			mood: 'good' as const,
			createdAt: new Date(),
			updatedAt: new Date(),
			loggedBy: 'user-1',
			updatedBy: 'user-1'
		};
		const result = toApiJournalEntry(row);
		expect(Object.keys(result).sort()).toEqual(Object.keys(JournalEntry.shape).sort());
	});

	it('toApiQuickLog output keys match QuickLog.shape', () => {
		const button = {
			id: 'ql-1',
			name: 'Walk',
			type: 'walk' as const,
			durationMinutes: 20,
			note: null,
			rememberAlso: false,
			companionIds: ['comp-1'],
			prefillCompanionIds: ['comp-1']
		};
		const result = toApiQuickLog(button);
		expect(Object.keys(result).sort()).toEqual(Object.keys(QuickLog.shape).sort());
	});

	it('toApiCompanion output keys match Companion.shape (full profile)', () => {
		const row = {
			id: 'comp-1',
			name: 'Ein',
			species: 'dog' as const,
			breed: 'Malinois',
			dob: '2020-01-01',
			sex: 'male' as const,
			weightUnit: 'kg' as const,
			microchip: '123456789',
			avatarPath: null,
			avatarProvider: 'local' as const,
			avatarStorageKey: null,
			bio: 'Good boy',
			feedingSchedule: 'Twice daily',
			walkSchedule: 'Morning and evening',
			medicationSchedule: null,
			emergencyContactName: 'Jane Doe',
			emergencyContactPhone: '555-0100',
			vetName: 'Dr. Smith',
			vetPhone: '555-0200',
			vetClinic: 'Downtown Vet',
			notesForSitter: 'Loves belly rubs',
			isActive: true,
			archivedAt: null,
			archiveNote: null,
			createdAt: new Date()
		};
		const result = toApiCompanion(row);
		expect(Object.keys(result).sort()).toEqual(Object.keys(Companion.shape).sort());
	});

	it('toApiCompanionMinimal output keys are a subset of Companion.shape', () => {
		const row = {
			id: 'comp-1',
			name: 'Ein',
			species: 'dog' as const,
			breed: null,
			dob: null,
			sex: null,
			weightUnit: 'kg' as const,
			microchip: null,
			avatarPath: null,
			avatarProvider: 'local' as const,
			avatarStorageKey: null,
			bio: null,
			feedingSchedule: null,
			walkSchedule: null,
			medicationSchedule: null,
			emergencyContactName: null,
			emergencyContactPhone: null,
			vetName: null,
			vetPhone: null,
			vetClinic: null,
			notesForSitter: null,
			isActive: true,
			archivedAt: null,
			archiveNote: null,
			createdAt: new Date()
		};
		const result = toApiCompanionMinimal(row);
		const schemaKeys = new Set(Object.keys(Companion.shape));
		for (const key of Object.keys(result)) {
			expect(schemaKeys.has(key)).toBe(true);
		}
	});
});
