import { describe, it, expect } from 'vitest';
import {
	toApiDailyEvent,
	toApiJournalEntry,
	toApiQuickLog,
	toApiCompanion,
	toApiCompanionMinimal,
	toApiHealthEvent,
	toApiWeightEntry,
	toApiReminder,
	toApiShift,
	toApiUser,
	toApiUserPublic
} from '$lib/server/api-serializers';
import {
	LoggedEvent,
	JournalEntry,
	QuickLog,
	Companion,
	HealthEvent,
	WeightEntry,
	Reminder,
	Shift,
	User,
	UserPublic
} from './schemas';

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

	it('toApiHealthEvent output keys match HealthEvent.shape', () => {
		const row = {
			id: 'health-1',
			companionId: 'comp-1',
			type: 'vet_visit' as const,
			title: 'Annual checkup',
			notes: 'All good',
			occurredAt: new Date(),
			vetName: 'Dr. Smith',
			vetClinic: 'Downtown Vet',
			createdAt: new Date(),
			loggedBy: 'user-1'
		};
		const result = toApiHealthEvent(row);
		expect(Object.keys(result).sort()).toEqual(Object.keys(HealthEvent.shape).sort());
	});

	it('toApiWeightEntry output keys match WeightEntry.shape', () => {
		const row = {
			id: 'weight-1',
			companionId: 'comp-1',
			weight: 12.5,
			unit: 'kg' as const,
			recordedAt: new Date(),
			notes: 'After breakfast',
			createdAt: new Date(),
			loggedBy: 'user-1'
		};
		const result = toApiWeightEntry(row);
		expect(Object.keys(result).sort()).toEqual(Object.keys(WeightEntry.shape).sort());
	});

	it('toApiReminder output keys match Reminder.shape', () => {
		const row = {
			id: 'rem-1',
			companionId: 'comp-1',
			title: 'Annual vaccination',
			description: 'Rabies booster',
			type: 'vaccination' as const,
			dueAt: new Date(),
			isRecurring: true,
			recurrenceUnit: 'year' as const,
			recurrenceInterval: 1,
			recurrenceAnchor: 'day_of_year' as const,
			recurrenceAnchorValue: 100,
			seriesId: 'series-1',
			completedAt: null,
			completedBy: null,
			createdAt: new Date(),
			loggedBy: 'user-1'
		};
		const result = toApiReminder(row);
		expect(Object.keys(result).sort()).toEqual(Object.keys(Reminder.shape).sort());
	});

	it('toApiShift output keys match Shift.shape', () => {
		const row = {
			id: 'shift-1',
			userId: 'user-1',
			startAt: new Date(),
			endAt: new Date(),
			notes: 'Evening feeding',
			createdAt: new Date()
		};
		const result = toApiShift(row);
		expect(Object.keys(result).sort()).toEqual(Object.keys(Shift.shape).sort());
	});

	// Security-critical: every column on `users` is populated here, including
	// the sensitive ones (passwordHash, totpSecret, oidcSubject, email, ntfy
	// topic, avatar storage keys, per-user settings). If toApiUser ever starts
	// returning one of those, this exact key-set match fails.
	it('toApiUser output keys match User.shape (never leaks sensitive columns)', () => {
		const row = {
			id: 'user-1',
			username: 'jdoe',
			displayName: 'Jane Doe',
			passwordHash: 'hashed-password',
			calendarFeedToken: 'feed-token-abc',
			role: 'caretaker' as const,
			isActive: true,
			createdAt: new Date(),
			lastLoginAt: new Date(),
			theme: 'dark' as const,
			locale: 'en' as const,
			email: 'jane@example.com',
			phone: '555-0100',
			oidcSubject: 'oidc-subject-1',
			oidcIssuer: 'https://idp.example.com',
			reminderUndoSeconds: 30,
			defaultRecurrenceUnit: 'month' as const,
			notifyReminderEmail: true,
			notifyShiftEmail: true,
			apiAccessEnabled: true,
			ntfyTopic: 'ntfy-topic-1',
			avatarPath: '/avatars/user-1.jpg',
			avatarProvider: 'local' as const,
			avatarStorageKey: 'avatar-storage-key-1',
			totpSecret: 'totp-secret-1',
			totpEnabledAt: new Date(),
			totpLastStep: 42
		};
		const result = toApiUser(row);
		expect(Object.keys(result).sort()).toEqual(Object.keys(User.shape).sort());
	});

	// Security-critical: member-scoped tokens get this reduced shape instead of
	// toApiUser, specifically to drop `username` (the login identifier).
	it('toApiUserPublic output keys match UserPublic.shape and omit username', () => {
		const row = {
			id: 'user-1',
			username: 'jdoe',
			displayName: 'Jane Doe',
			passwordHash: 'hashed-password',
			calendarFeedToken: 'feed-token-abc',
			role: 'caretaker' as const,
			isActive: true,
			createdAt: new Date(),
			lastLoginAt: new Date(),
			theme: 'dark' as const,
			locale: 'en' as const,
			email: 'jane@example.com',
			phone: '555-0100',
			oidcSubject: 'oidc-subject-1',
			oidcIssuer: 'https://idp.example.com',
			reminderUndoSeconds: 30,
			defaultRecurrenceUnit: 'month' as const,
			notifyReminderEmail: true,
			notifyShiftEmail: true,
			apiAccessEnabled: true,
			ntfyTopic: 'ntfy-topic-1',
			avatarPath: '/avatars/user-1.jpg',
			avatarProvider: 'local' as const,
			avatarStorageKey: 'avatar-storage-key-1',
			totpSecret: 'totp-secret-1',
			totpEnabledAt: new Date(),
			totpLastStep: 42
		};
		const result = toApiUserPublic(row);
		expect(Object.keys(result).sort()).toEqual(Object.keys(UserPublic.shape).sort());
		expect(Object.keys(result)).not.toContain('username');
	});
});
