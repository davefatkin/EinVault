import { describe, it, expect } from 'vitest';
import {
	toApiCompanion,
	toApiCompanionMinimal,
	toApiNote,
	toApiHealthEvent,
	toApiIncidentUpdate,
	toApiIncidentLink,
	toApiReminder,
	toApiMedication
} from './api-serializers';

// A companion row carrying PII the write-scope shape must never leak, plus a
// stray column the default-deny full shape must not pass through untouched.
const row = {
	id: 'c1',
	name: 'Rex',
	species: 'dog',
	breed: 'mutt',
	dob: '2020-01-01',
	dobApproximate: true,
	homecomingDate: '2021-06-01',
	sex: 'male',
	weightUnit: 'kg',
	microchip: '985112000000000',
	bio: 'good boy',
	feedingSchedule: '8am',
	walkSchedule: '9am',
	medicationSchedule: null,
	emergencyContactName: 'Jane',
	emergencyContactPhone: '555-0100',
	vetName: 'Dr Vet',
	vetPhone: '555-0200',
	vetClinic: 'Clinic',
	notesForSitter: 'secret gate code 1234',
	isActive: true,
	archivedAt: null,
	archiveNote: null,
	createdAt: new Date('2024-01-01T00:00:00Z'),
	// Storage plumbing and any future column must not be exposed by default-deny.
	avatarKey: 's3://bucket/secret.jpg',
	secretFutureColumn: 'should never appear'
} as unknown as Parameters<typeof toApiCompanion>[0];

const PII_FIELDS = [
	'microchip',
	'emergencyContactName',
	'emergencyContactPhone',
	'vetName',
	'vetPhone',
	'vetClinic',
	'notesForSitter'
];

describe('api companion serializers', () => {
	it('full shape includes PII but never storage/unknown columns (default-deny)', () => {
		const out = toApiCompanion(row);
		expect(out.dobApproximate).toBe(true);
		expect(out.homecomingDate).toBe('2021-06-01');
		expect(out.microchip).toBe('985112000000000');
		expect('avatarKey' in out).toBe(false);
		expect('secretFutureColumn' in out).toBe(false);
	});

	it('notesForSitter comes from shared notes, never the deprecated column', () => {
		expect(toApiCompanion(row).notesForSitter).toBeNull();
		expect(toApiCompanion(row, '## Feeding\n\nTwice a day.').notesForSitter).toBe(
			'## Feeding\n\nTwice a day.'
		);
	});

	it('minimal (write-scope) shape omits every PII field', () => {
		const out = toApiCompanionMinimal(row);
		expect(out).toEqual({ id: 'c1', name: 'Rex', species: 'dog', isActive: true });
		for (const field of PII_FIELDS) {
			expect(field in out).toBe(false);
		}
	});
});

describe('toApiNote', () => {
	it('exposes the public note fields only', () => {
		const out = toApiNote({
			id: 'n1',
			companionId: 'c1',
			title: 'Commands',
			body: '- sit',
			sharedWithCaretakers: true,
			pinned: false,
			createdAt: new Date('2026-01-01T00:00:00Z'),
			updatedAt: new Date('2026-01-02T00:00:00Z'),
			loggedBy: 'u1',
			updatedBy: 'u2',
			tags: ['training']
		});
		expect(out).toEqual({
			id: 'n1',
			companionId: 'c1',
			title: 'Commands',
			body: '- sit',
			tags: ['training'],
			pinned: false,
			sharedWithCaretakers: true,
			createdAt: new Date('2026-01-01T00:00:00Z'),
			updatedAt: new Date('2026-01-02T00:00:00Z'),
			updatedBy: 'u2'
		});
	});
});

describe('api incident serializers', () => {
	const at = new Date('2026-01-02T03:04:05Z');
	it('health event exposes severity and resolvedAt, still default-deny', () => {
		const out = toApiHealthEvent({
			id: 'h1',
			companionId: 'c1',
			type: 'incident',
			title: 'Limp',
			notes: null,
			occurredAt: at,
			vetName: null,
			vetClinic: null,
			severity: 'mild',
			resolvedAt: at,
			loggedBy: 'u1',
			secretFutureColumn: 'x'
		} as unknown as Parameters<typeof toApiHealthEvent>[0]);
		expect(out.severity).toBe('mild');
		expect(out.resolvedAt).toBe(at);
		expect('loggedBy' in out).toBe(false);
		expect('secretFutureColumn' in out).toBe(false);
	});

	it('update whitelists its fields', () => {
		const out = toApiIncidentUpdate({
			id: 'u1',
			healthEventId: 'h1',
			body: 'better',
			severity: null,
			occurredAt: at,
			createdAt: at,
			loggedBy: 'x'
		} as unknown as Parameters<typeof toApiIncidentUpdate>[0]);
		expect(out).toEqual({
			id: 'u1',
			incidentId: 'h1',
			body: 'better',
			severity: null,
			occurredAt: at,
			createdAt: at
		});
	});

	it('link whitelists its fields', () => {
		const out = toApiIncidentLink({
			id: 'e1',
			type: 'vet_visit',
			title: 'Checkup',
			occurredAt: at,
			vetName: 'Dr',
			vetClinic: null,
			notes: 'n',
			extra: 1
		} as unknown as Parameters<typeof toApiIncidentLink>[0]);
		expect(Object.keys(out).sort()).toEqual(
			['id', 'notes', 'occurredAt', 'title', 'type', 'vetClinic', 'vetName'].sort()
		);
	});
});

describe('toApiReminder', () => {
	const base = {
		id: 'r1',
		companionId: 'c1',
		title: 'Booster',
		description: null,
		type: 'vet',
		dueAt: new Date('2025-01-01T00:00:00Z'),
		isRecurring: false,
		completedAt: null,
		outcome: null,
		seriesId: null,
		medicationId: null
	};

	it('returns leadDays from the stored text', () => {
		const out = toApiReminder({ ...base, notifyLeadDays: '7,2' } as never);
		expect(out.leadDays).toEqual([7, 2]);
	});

	it('returns an empty array when no heads-ups are set', () => {
		expect(toApiReminder({ ...base, notifyLeadDays: null } as never).leadDays).toEqual([]);
	});
});

describe('medication serializers', () => {
	const reminderBase = {
		id: 'r1',
		companionId: 'c1',
		title: 'Pill',
		description: null,
		type: 'medication',
		dueAt: new Date('2025-01-01T00:00:00Z'),
		isRecurring: false,
		completedAt: null,
		outcome: null,
		seriesId: null,
		notifyLeadDays: null
	};

	it('reminder exposes medicationId (nullable)', () => {
		expect(toApiReminder({ ...reminderBase, medicationId: 'm1' } as never).medicationId).toBe('m1');
		expect(toApiReminder({ ...reminderBase, medicationId: null } as never).medicationId).toBeNull();
	});

	it('toApiMedication whitelists fields and flattens lastGiven', () => {
		const at = new Date('2026-11-01T08:00:00Z');
		const out = toApiMedication({
			id: 'm1',
			companionId: 'c1',
			name: 'Carprofen',
			dose: '1 tablet',
			instructions: 'with food',
			startedOn: '2026-11-01',
			endedOn: null,
			active: true,
			nextDueAt: at,
			lastGiven: { at, by: { displayName: 'Jet' } },
			schedule: [{ secret: 1 }]
		} as never);
		expect(out).toEqual({
			id: 'm1',
			companionId: 'c1',
			name: 'Carprofen',
			dose: '1 tablet',
			instructions: 'with food',
			startedOn: '2026-11-01',
			endedOn: null,
			active: true,
			nextDueAt: at,
			lastGiven: { at, by: 'Jet' }
		});
		expect(
			toApiMedication({ ...out, schedule: [], lastGiven: null } as never).lastGiven
		).toBeNull();
	});

	it('companion alias comes from the argument, not the cleared column', () => {
		expect(toApiCompanion(row, null, '- Carprofen, 1 tablet').medicationSchedule).toBe(
			'- Carprofen, 1 tablet'
		);
		expect(toApiCompanion(row).medicationSchedule).toBeNull();
	});
});
