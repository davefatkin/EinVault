import type {
	companions,
	dailyEvents,
	journalEntries,
	healthEvents,
	weightEntries,
	reminders,
	caretakerShifts,
	users
} from '$lib/server/db/schema';
import type { QuickLogButton } from '$lib/server/quick-logs';

type CompanionRow = typeof companions.$inferSelect;
type DailyEventRow = typeof dailyEvents.$inferSelect;
type JournalEntryRow = typeof journalEntries.$inferSelect;
type HealthEventRow = typeof healthEvents.$inferSelect;
type WeightEntryRow = typeof weightEntries.$inferSelect;
type ReminderRow = typeof reminders.$inferSelect;
type CaretakerShiftRow = typeof caretakerShifts.$inferSelect;
type UserRow = typeof users.$inferSelect;

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

// Public shape for a logged daily event (read-back via GET /api/logs).
export function toApiDailyEvent(row: DailyEventRow) {
	return {
		id: row.id,
		companionId: row.companionId,
		type: row.type,
		notes: row.notes,
		durationMinutes: row.durationMinutes,
		loggedAt: row.loggedAt,
		eventGroupId: row.eventGroupId
	};
}

// Public shape for a journal entry (read-back via GET /api/journal).
export function toApiJournalEntry(row: JournalEntryRow) {
	return {
		id: row.id,
		companionId: row.companionId,
		date: row.date,
		body: row.body,
		mood: row.mood,
		updatedAt: row.updatedAt
	};
}

// Public shape for a health event (read-back via GET /api/health-events). Omits the
// internal loggedBy/createdAt plumbing, matching the daily-event convention.
export function toApiHealthEvent(row: HealthEventRow) {
	return {
		id: row.id,
		companionId: row.companionId,
		type: row.type,
		title: row.title,
		notes: row.notes,
		occurredAt: row.occurredAt,
		vetName: row.vetName,
		vetClinic: row.vetClinic
	};
}

// Public shape for a weight entry (read-back via GET /api/weight).
export function toApiWeightEntry(row: WeightEntryRow) {
	return {
		id: row.id,
		companionId: row.companionId,
		weight: row.weight,
		unit: row.unit,
		notes: row.notes,
		recordedAt: row.recordedAt
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

// Public shape for a reminder (list via GET /api/reminders). Omits the internal
// recurrence-engine columns (anchor/interval/unit) and loggedBy/completedBy.
export function toApiReminder(row: ReminderRow) {
	return {
		id: row.id,
		companionId: row.companionId,
		title: row.title,
		description: row.description,
		type: row.type,
		dueAt: row.dueAt,
		isRecurring: row.isRecurring,
		completedAt: row.completedAt,
		seriesId: row.seriesId
	};
}

// Minimal companion shape for `write`-scoped tokens (log-only devices): just
// enough to target a log, WITHOUT the PII (microchip, emergency/vet contacts,
// notesForSitter) that a lifted button token has no need to read.
export function toApiCompanionMinimal(row: CompanionRow) {
	return {
		id: row.id,
		name: row.name,
		species: row.species,
		isActive: row.isActive
	};
}

// Public shape for a caretaker shift (GET /api/shifts). Exposes who + when;
// clients resolve the caretaker's name via GET /api/users.
export function toApiShift(row: CaretakerShiftRow) {
	return {
		id: row.id,
		userId: row.userId,
		startAt: row.startAt,
		endAt: row.endAt,
		notes: row.notes
	};
}

// Public shape for a user (GET /api/users). STRICT default-deny: only the
// roster fields. Never expose password hash, TOTP secrets, OIDC identifiers,
// email/phone, calendar-feed token, avatar storage keys, ntfy topic, or any
// per-user setting. Adding a users column does NOT expose it until it is added
// here AND the drift test is updated.
export function toApiUser(row: UserRow) {
	return {
		id: row.id,
		username: row.username,
		displayName: row.displayName,
		role: row.role,
		isActive: row.isActive
	};
}

// Reduced user shape for member-scoped tokens: drops `username` (the login
// identifier) so a member can't harvest logins. Admins/caretaker-self use the
// full toApiUser. Default-deny like every serializer here.
export function toApiUserPublic(row: UserRow) {
	return {
		id: row.id,
		displayName: row.displayName,
		role: row.role,
		isActive: row.isActive
	};
}
