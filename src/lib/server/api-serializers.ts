import type { companions } from '$lib/server/db/schema';

type CompanionRow = typeof companions.$inferSelect;

// Public JSON shape for a companion over the Bearer-token API. Every API
// endpoint returning companion data goes through here so the payload is
// default-deny: a new column on the companions table is NOT exposed until it
// is added below. The avatar* storage columns are omitted entirely: they are
// internal storage plumbing, and /api/avatars is session-gated so a token
// holder can't fetch the image anyway.
export function toApiCompanion(row: CompanionRow) {
	return {
		id: row.id,
		name: row.name,
		species: row.species,
		breed: row.breed,
		dob: row.dob,
		sex: row.sex,
		weightUnit: row.weightUnit,
		microchip: row.microchip,
		bio: row.bio,
		feedingSchedule: row.feedingSchedule,
		walkSchedule: row.walkSchedule,
		medicationSchedule: row.medicationSchedule,
		emergencyContactName: row.emergencyContactName,
		emergencyContactPhone: row.emergencyContactPhone,
		vetName: row.vetName,
		vetPhone: row.vetPhone,
		vetClinic: row.vetClinic,
		notesForSitter: row.notesForSitter,
		isActive: row.isActive,
		archivedAt: row.archivedAt,
		archiveNote: row.archiveNote,
		createdAt: row.createdAt
	};
}
