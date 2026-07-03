import type { companions } from '$lib/server/db/schema';
import type { QuickLogButton } from '$lib/server/quick-logs';

type CompanionRow = typeof companions.$inferSelect;

// Convention: every /api/* handler that returns a model builds its JSON here,
// never inline, so each model has one default-deny serializer.

// Public shape for a quick log over the API (discovery for the execute route).
// Drops the UI-only fields (rememberAlso, prefillCompanionIds).
export function toApiQuickLog(b: QuickLogButton) {
	return {
		id: b.id,
		name: b.name,
		type: b.type,
		durationMinutes: b.durationMinutes,
		note: b.note,
		companionIds: b.companionIds
	};
}

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
