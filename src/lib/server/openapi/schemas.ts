import { z } from './z';
import { MAX_NOTE_LEN } from '$lib/textLimits';

// Shared zod schemas for the Bearer API. Single source of truth: the route
// validates against these AND the OpenAPI spec is generated from them, so the
// docs can't drift from what the endpoint actually accepts.

export const DailyEventType = z
	.enum(['walk', 'meal', 'bathroom', 'treat', 'play', 'grooming', 'other'])
	.openapi('DailyEventType');

export const LogRequest = z
	.object({
		companionId: z.string().min(1).optional().openapi({ description: 'Single target companion.' }),
		companionIds: z
			.array(z.string().min(1))
			.max(50)
			.optional()
			.openapi({ description: 'Multiple target companions (takes precedence over companionId).' }),
		type: DailyEventType,
		notes: z.string().max(MAX_NOTE_LEN).optional(),
		durationMinutes: z.number().int().positive().max(480).optional(),
		loggedAt: z.string().optional().openapi({
			format: 'date-time',
			description: 'ISO 8601. Defaults to now; bounded to now-5y..now+1d.'
		})
	})
	.strict()
	.openapi('LogRequest', {
		// Concrete example so the docs Try-It seeds a body with a target companion:
		// companionId/companionIds are both optional in the schema (one or the
		// other), so the generic example builder would otherwise omit both.
		example: { companionId: 'companion-id-here', type: 'walk', durationMinutes: 30 }
	});

export type LogRequestBody = z.infer<typeof LogRequest>;

export const LogResponse = z
	.object({
		ids: z.array(z.string()),
		eventGroupId: z.string().nullable()
	})
	.openapi('LogResponse');

// The stable machine-parseable error envelope every endpoint returns on failure.
export const ApiError = z
	.object({
		code: z.string().openapi({ example: 'noteTooLong' }),
		message: z.string()
	})
	.openapi('ApiError');

// Common/minimal companion subset returned to both full- and write-scoped
// tokens (write-scope gets only id/name/species/isActive via
// toApiCompanionMinimal; full-scope gets the rest via toApiCompanion). Fields
// write-scope omits are optional here rather than claimed unconditionally.
export const Companion = z
	.object({
		id: z.string(),
		name: z.string(),
		species: z.string().nullable(),
		isActive: z.boolean(),
		breed: z.string().nullable().optional(),
		dob: z.string().nullable().optional(),
		sex: z.string().nullable().optional(),
		weightUnit: z.string().nullable().optional(),
		microchip: z.string().nullable().optional(),
		bio: z.string().nullable().optional(),
		feedingSchedule: z.string().nullable().optional(),
		walkSchedule: z.string().nullable().optional(),
		medicationSchedule: z.string().nullable().optional(),
		emergencyContactName: z.string().nullable().optional(),
		emergencyContactPhone: z.string().nullable().optional(),
		vetName: z.string().nullable().optional(),
		vetPhone: z.string().nullable().optional(),
		vetClinic: z.string().nullable().optional(),
		notesForSitter: z.string().nullable().optional(),
		archivedAt: z.string().nullable().optional(),
		archiveNote: z.string().nullable().optional(),
		createdAt: z.string().optional()
	})
	.openapi('Companion');

export const CompanionList = z.object({ companions: z.array(Companion) }).openapi('CompanionList');

export const LoggedEvent = z
	.object({
		id: z.string(),
		companionId: z.string(),
		type: DailyEventType,
		notes: z.string().nullable(),
		durationMinutes: z.number().int().nullable(),
		loggedAt: z.string().openapi({ description: 'ISO 8601 timestamp.' }),
		eventGroupId: z.string().nullable()
	})
	.openapi('LoggedEvent');

export const LogListResponse = z
	.object({ events: z.array(LoggedEvent), hasMore: z.boolean() })
	.openapi('LogListResponse');

export const JournalEntry = z
	.object({
		id: z.string(),
		companionId: z.string(),
		date: z.string().openapi({ description: 'YYYY-MM-DD.' }),
		body: z.string().nullable(),
		mood: z.enum(['great', 'good', 'meh', 'off', 'sick']).nullable(),
		updatedAt: z.string()
	})
	.openapi('JournalEntry');

export const JournalReadResponse = z
	.object({ entry: JournalEntry.nullable() })
	.openapi('JournalReadResponse');

export const JournalWriteResponse = z
	.object({ id: z.string(), companionId: z.string(), date: z.string() })
	.openapi('JournalWriteResponse');

export const JournalRequest = z
	.object({
		companionId: z.string().min(1),
		date: z.string().optional().openapi({ description: 'YYYY-MM-DD; default today.' }),
		body: z.string().optional().openapi({ description: 'Absent preserves stored text.' }),
		mood: z.enum(['great', 'good', 'meh', 'off', 'sick']).optional()
	})
	.strict()
	.openapi('JournalRequest');

export const QuickLog = z
	.object({
		id: z.string(),
		name: z.string(),
		type: DailyEventType,
		durationMinutes: z.number().int().nullable(),
		note: z.string().nullable(),
		companionIds: z.array(z.string())
	})
	.openapi('QuickLog');

export const QuickLogList = z.object({ quickLogs: z.array(QuickLog) }).openapi('QuickLogList');

export const ExecuteResponse = z.object({ ids: z.array(z.string()) }).openapi('ExecuteResponse');

export const HealthEventType = z
	.enum(['vet_visit', 'vaccination', 'medication', 'procedure', 'other'])
	.openapi('HealthEventType');

export const HealthRequest = z
	.object({
		companionId: z.string().min(1),
		type: HealthEventType,
		title: z.string().min(1).max(MAX_NOTE_LEN),
		notes: z.string().max(MAX_NOTE_LEN).optional(),
		occurredAt: z.string().optional().openapi({
			format: 'date-time',
			description: 'ISO 8601. Defaults to now; may be old, not far future.'
		}),
		vetName: z.string().max(MAX_NOTE_LEN).optional(),
		vetClinic: z.string().max(MAX_NOTE_LEN).optional()
	})
	.strict()
	.openapi('HealthRequest');

export const HealthEvent = z
	.object({
		id: z.string(),
		companionId: z.string(),
		type: HealthEventType,
		title: z.string(),
		notes: z.string().nullable(),
		occurredAt: z.string(),
		vetName: z.string().nullable(),
		vetClinic: z.string().nullable()
	})
	.openapi('HealthEvent');

export const HealthList = z
	.object({ events: z.array(HealthEvent), hasMore: z.boolean() })
	.openapi('HealthList');
export const HealthWriteResponse = z
	.object({ id: z.string(), companionId: z.string() })
	.openapi('HealthWriteResponse');

export const WeightUnit = z.enum(['kg', 'lbs']).openapi('WeightUnit');

export const WeightRequest = z
	.object({
		companionId: z.string().min(1),
		weight: z.number().positive(),
		unit: WeightUnit,
		notes: z.string().max(MAX_NOTE_LEN).optional(),
		recordedAt: z.string().optional().openapi({
			format: 'date-time',
			description: 'ISO 8601. Defaults to now; may be old, not far future.'
		})
	})
	.strict()
	.openapi('WeightRequest');

export const WeightEntry = z
	.object({
		id: z.string(),
		companionId: z.string(),
		weight: z.number(),
		unit: WeightUnit,
		notes: z.string().nullable(),
		recordedAt: z.string()
	})
	.openapi('WeightEntry');

export const WeightList = z
	.object({ entries: z.array(WeightEntry), hasMore: z.boolean() })
	.openapi('WeightList');
export const WeightWriteResponse = z
	.object({ id: z.string(), companionId: z.string() })
	.openapi('WeightWriteResponse');

export const ReminderType = z
	.enum(['vet', 'medication', 'vaccination', 'grooming', 'other'])
	.openapi('ReminderType');

export const Reminder = z
	.object({
		id: z.string(),
		companionId: z.string(),
		title: z.string(),
		description: z.string().nullable(),
		type: ReminderType,
		dueAt: z.string(),
		isRecurring: z.boolean(),
		completedAt: z.string().nullable(),
		seriesId: z.string().nullable()
	})
	.openapi('Reminder');

export const ReminderList = z
	.object({ reminders: z.array(Reminder), hasMore: z.boolean() })
	.openapi('ReminderList');

export const CompleteResponse = z
	.object({
		id: z.string(),
		completedAt: z.string(),
		nextReminderId: z.string().nullable()
	})
	.openapi('CompleteResponse');

export const Shift = z
	.object({
		id: z.string(),
		userId: z.string(),
		startAt: z.string(),
		endAt: z.string(),
		notes: z.string().nullable()
	})
	.openapi('Shift');

export const ShiftList = z
	.object({ shifts: z.array(Shift), hasMore: z.boolean() })
	.openapi('ShiftList');

export const User = z
	.object({
		id: z.string(),
		username: z.string().optional().openapi({ description: 'Omitted for member-scoped tokens.' }),
		displayName: z.string(),
		role: z.enum(['admin', 'member', 'caretaker']),
		isActive: z.boolean()
	})
	.openapi('User');

export const UserList = z
	.object({ users: z.array(User), hasMore: z.boolean() })
	.openapi('UserList');

// Drift-guard only: mirrors toApiUserPublic's reduced shape (no `username`),
// returned to member-scoped tokens from GET /api/users.
export const UserPublic = z
	.object({
		id: z.string(),
		displayName: z.string(),
		role: z.enum(['admin', 'member', 'caretaker']),
		isActive: z.boolean()
	})
	.openapi('UserPublic');
