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
	.openapi('LogRequest');

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
	.object({ events: z.array(LoggedEvent) })
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
