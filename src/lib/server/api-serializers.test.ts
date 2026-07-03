import { describe, it, expect } from 'vitest';
import { toApiCompanion, toApiCompanionMinimal } from './api-serializers';

// A companion row carrying PII the write-scope shape must never leak, plus a
// stray column the default-deny full shape must not pass through untouched.
const row = {
	id: 'c1',
	name: 'Rex',
	species: 'dog',
	breed: 'mutt',
	dob: '2020-01-01',
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
		expect(out.microchip).toBe('985112000000000');
		expect(out.notesForSitter).toBe('secret gate code 1234');
		expect('avatarKey' in out).toBe(false);
		expect('secretFutureColumn' in out).toBe(false);
	});

	it('minimal (write-scope) shape omits every PII field', () => {
		const out = toApiCompanionMinimal(row);
		expect(out).toEqual({ id: 'c1', name: 'Rex', species: 'dog', isActive: true });
		for (const field of PII_FIELDS) {
			expect(field in out).toBe(false);
		}
	});
});
