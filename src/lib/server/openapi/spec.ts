import { OpenAPIRegistry, OpenApiGeneratorV31 } from '@asteasolutions/zod-to-openapi';
import { z } from './z';
import {
	LogRequest,
	LogResponse,
	LogListResponse,
	ApiError,
	JournalRequest,
	JournalReadResponse,
	JournalWriteResponse,
	QuickLogList,
	ExecuteResponse,
	CompanionList,
	Companion,
	HealthRequest,
	HealthList,
	HealthWriteResponse,
	WeightRequest,
	WeightList,
	WeightWriteResponse,
	ReminderList,
	CompleteResponse,
	SkipResponse,
	ShiftList,
	UserList,
	Note,
	NoteList,
	NoteWriteResponse,
	NoteCreate,
	NoteUpdate
} from './schemas';

// Builds the OpenAPI 3.1 document from the shared zod schemas. Paths are
// registered here (central assembly) rather than as side effects in each
// +server.ts, since SvelteKit only imports a route module when it is hit.
export function buildOpenApiDocument() {
	const registry = new OpenAPIRegistry();

	registry.registerComponent('securitySchemes', 'bearerAuth', {
		type: 'http',
		scheme: 'bearer',
		description: 'An API token from Settings → API tokens.'
	});
	const secured = [{ bearerAuth: [] as string[] }];

	const errorResponse = (description: string) => ({
		description,
		content: { 'application/json': { schema: ApiError } }
	});

	const paginationQuery = {
		limit: z.number().int().optional().openapi({ description: '1-200, default 50.' }),
		offset: z.number().int().optional().openapi({ description: 'Default 0, max 100000.' })
	};

	registry.registerPath({
		method: 'post',
		path: '/api/logs',
		tags: ['logs'],
		summary: 'Log a daily event',
		description:
			'Creates one daily event per target companion. The token acts as its user, so caretaker shift/assignment rules still apply. Send an Idempotency-Key header to make a retry a no-op.',
		security: secured,
		request: {
			body: { content: { 'application/json': { schema: LogRequest } }, required: true }
		},
		responses: {
			201: {
				description: 'Created',
				content: { 'application/json': { schema: LogResponse } }
			},
			400: errorResponse(
				"Invalid body (invalidType, noCompanions, noteTooLong, …); typeNotAllowedForSpecies when a target companion's species can't have the activity."
			),
			401: errorResponse('Missing or invalid token'),
			403: errorResponse('noActiveShift / notAssigned'),
			404: errorResponse('API disabled'),
			429: errorResponse('Rate limited')
		}
	});

	registry.registerPath({
		method: 'get',
		path: '/api/logs',
		tags: ['logs'],
		summary: 'Read back logged daily events',
		description:
			'Newest first. Paginated with limit/offset; see hasMore. Requires a full-scope token.',
		security: secured,
		request: {
			query: z.object({
				companionId: z.string().openapi({ description: 'Required target companion.' }),
				date: z.string().optional().openapi({ description: 'YYYY-MM-DD; omit for all.' }),
				...paginationQuery
			})
		},
		responses: {
			200: { description: 'OK', content: { 'application/json': { schema: LogListResponse } } },
			400: errorResponse('noCompanions / invalidDate / invalidPagination'),
			401: errorResponse('Missing or invalid token'),
			403: errorResponse('writeScopeReadOnly / notAssigned'),
			404: errorResponse('API disabled'),
			429: errorResponse('Rate limited')
		}
	});

	registry.registerPath({
		method: 'get',
		path: '/api/journal',
		tags: ['journal'],
		summary: "Read back a companion's journal entry for a day",
		description: 'Returns the entry or { entry: null }. Requires a full-scope token.',
		security: secured,
		request: {
			query: z.object({
				companionId: z.string().openapi({ description: 'Required target companion.' }),
				date: z.string().optional().openapi({ description: 'YYYY-MM-DD; defaults to today.' })
			})
		},
		responses: {
			200: {
				description: 'OK',
				content: { 'application/json': { schema: JournalReadResponse } }
			},
			400: errorResponse('noCompanions / invalidDate'),
			401: errorResponse('Missing or invalid token'),
			403: errorResponse('writeScopeReadOnly / notAssigned'),
			404: errorResponse('API disabled'),
			429: errorResponse('Rate limited')
		}
	});

	registry.registerPath({
		method: 'post',
		path: '/api/journal',
		tags: ['journal'],
		summary: 'Upsert a journal entry',
		description:
			'Replaces the day’s body/mood (partial: absent keys are preserved). Caretakers may only write today. Send an Idempotency-Key header to make a retry a no-op.',
		security: secured,
		request: {
			body: { content: { 'application/json': { schema: JournalRequest } }, required: true }
		},
		responses: {
			201: {
				description: 'Created',
				content: { 'application/json': { schema: JournalWriteResponse } }
			},
			400: errorResponse('invalidDate / journalTooLong / invalidBody / invalidMood'),
			401: errorResponse('Missing or invalid token'),
			403: errorResponse('forbidden (caretaker non-today) / notAssigned'),
			404: errorResponse('API disabled'),
			409: errorResponse('idempotencyKeyReused'),
			429: errorResponse('Rate limited')
		}
	});

	registry.registerPath({
		method: 'get',
		path: '/api/quick-logs',
		tags: ['quick-logs'],
		summary: "List the token user's enabled quick logs",
		description: 'Discovery for ids used by POST /api/quick-logs/{id}/execute.',
		security: secured,
		responses: {
			200: { description: 'OK', content: { 'application/json': { schema: QuickLogList } } },
			401: errorResponse('Missing or invalid token'),
			404: errorResponse('API disabled'),
			429: errorResponse('Rate limited')
		}
	});

	registry.registerPath({
		method: 'post',
		path: '/api/quick-logs/{id}/execute',
		tags: ['quick-logs'],
		summary: 'Run a configured quick log',
		description:
			'Body optional: { companionIds?, loggedAt? }. With no body, the remembered/assigned target set is used. Send an Idempotency-Key header to make a retry a no-op.',
		security: secured,
		request: {
			params: z.object({ id: z.string() })
		},
		responses: {
			201: {
				description: 'Created',
				content: { 'application/json': { schema: ExecuteResponse } }
			},
			401: errorResponse('Missing or invalid token'),
			403: errorResponse('noActiveShift / notAssigned'),
			404: errorResponse('Not found (also returned when the id is not owned by the token user)'),
			409: errorResponse('idempotencyKeyReused'),
			429: errorResponse('Rate limited')
		}
	});

	registry.registerPath({
		method: 'get',
		path: '/api/companions',
		tags: ['companions'],
		summary: 'List companions the token user may target',
		description:
			'Full-scope tokens get the full companion shape; write-scope tokens get a minimal projection without PII.',
		security: secured,
		responses: {
			200: { description: 'OK', content: { 'application/json': { schema: CompanionList } } },
			401: errorResponse('Missing or invalid token'),
			404: errorResponse('API disabled'),
			429: errorResponse('Rate limited')
		}
	});

	registry.registerPath({
		method: 'get',
		path: '/api/companions/{companionId}',
		tags: ['companions'],
		summary: 'Get one companion the token user may target',
		description:
			'Full-scope tokens get the full companion shape; write-scope tokens get a minimal projection without PII. An id the token cannot access reads as 404 (no enumeration); an archived companion also reads as 404, not as a distinguishable "deleted" state.',
		security: secured,
		request: {
			params: z.object({ companionId: z.string() })
		},
		responses: {
			200: {
				description: 'OK',
				content: { 'application/json': { schema: z.object({ companion: Companion }) } }
			},
			401: errorResponse('Missing or invalid token'),
			404: errorResponse('Not found (also returned when the id is not owned by the token user)'),
			429: errorResponse('Rate limited')
		}
	});

	registry.registerPath({
		method: 'post',
		path: '/api/health-events',
		tags: ['health'],
		summary: 'Log a health event',
		description:
			'Creates one health event for a companion (vet visit, vaccination, medication, procedure, or other). The token acts as its user, so caretaker shift/assignment rules still apply. Send an Idempotency-Key header to make a retry a no-op.',
		security: secured,
		request: {
			body: { content: { 'application/json': { schema: HealthRequest } }, required: true }
		},
		responses: {
			201: {
				description: 'Created',
				content: { 'application/json': { schema: HealthWriteResponse } }
			},
			400: errorResponse('invalidType / titleRequired / noteTooLong / invalidOccurredAt'),
			401: errorResponse('Missing or invalid token'),
			403: errorResponse('notAssigned / noActiveShift'),
			404: errorResponse('API disabled'),
			409: errorResponse('idempotencyKeyReused'),
			429: errorResponse('Rate limited')
		}
	});

	registry.registerPath({
		method: 'get',
		path: '/api/health-events',
		tags: ['health'],
		summary: "Read back a companion's health events",
		description:
			'Newest first by occurredAt. Paginated with limit/offset; see hasMore. Requires a full-scope token.',
		security: secured,
		request: {
			query: z.object({
				companionId: z.string().openapi({ description: 'Required target companion.' }),
				date: z.string().optional().openapi({ description: 'YYYY-MM-DD; omit for all.' }),
				...paginationQuery
			})
		},
		responses: {
			200: { description: 'OK', content: { 'application/json': { schema: HealthList } } },
			400: errorResponse('noCompanions / invalidDate / invalidPagination'),
			401: errorResponse('Missing or invalid token'),
			403: errorResponse('writeScopeReadOnly / notAssigned'),
			404: errorResponse('API disabled'),
			429: errorResponse('Rate limited')
		}
	});

	registry.registerPath({
		method: 'post',
		path: '/api/weight',
		tags: ['weight'],
		summary: 'Log a weight entry',
		description:
			'Creates one weight entry for a companion. The token acts as its user, so caretaker shift/assignment rules still apply. Send an Idempotency-Key header to make a retry a no-op.',
		security: secured,
		request: {
			body: { content: { 'application/json': { schema: WeightRequest } }, required: true }
		},
		responses: {
			201: {
				description: 'Created',
				content: { 'application/json': { schema: WeightWriteResponse } }
			},
			400: errorResponse('invalidWeight / invalidUnit / noteTooLong / invalidRecordedAt'),
			401: errorResponse('Missing or invalid token'),
			403: errorResponse('notAssigned / noActiveShift'),
			404: errorResponse('API disabled'),
			409: errorResponse('idempotencyKeyReused'),
			429: errorResponse('Rate limited')
		}
	});

	registry.registerPath({
		method: 'get',
		path: '/api/weight',
		tags: ['weight'],
		summary: "Read back a companion's weight entries",
		description:
			'Newest first by recordedAt. Paginated with limit/offset; see hasMore. Requires a full-scope token.',
		security: secured,
		request: {
			query: z.object({
				companionId: z.string().openapi({ description: 'Required target companion.' }),
				...paginationQuery
			})
		},
		responses: {
			200: { description: 'OK', content: { 'application/json': { schema: WeightList } } },
			400: errorResponse('noCompanions / invalidPagination'),
			401: errorResponse('Missing or invalid token'),
			403: errorResponse('writeScopeReadOnly / notAssigned'),
			404: errorResponse('API disabled'),
			429: errorResponse('Rate limited')
		}
	});

	registry.registerPath({
		method: 'get',
		path: '/api/reminders',
		tags: ['reminders'],
		summary: "List the token user's reminders",
		description:
			'Paginated with limit/offset; see hasMore. Without companionId, lists across every companion the token user may access. Requires a full-scope token.',
		security: secured,
		request: {
			query: z.object({
				companionId: z
					.string()
					.optional()
					.openapi({ description: 'Omit to list across all allowed companions.' }),
				status: z
					.enum(['due', 'all'])
					.optional()
					.openapi({ description: 'Defaults to due (not yet completed).' }),
				...paginationQuery
			})
		},
		responses: {
			200: { description: 'OK', content: { 'application/json': { schema: ReminderList } } },
			400: errorResponse('invalidStatus / invalidPagination'),
			401: errorResponse('Missing or invalid token'),
			403: errorResponse('writeScopeReadOnly / notAssigned'),
			404: errorResponse('API disabled'),
			429: errorResponse('Rate limited')
		}
	});

	registry.registerPath({
		method: 'post',
		path: '/api/reminders/{id}/complete',
		tags: ['reminders'],
		summary: 'Mark a reminder done',
		description:
			'Completing a recurring reminder spawns its next occurrence (nextReminderId); a one-off reminder returns nextReminderId: null. Send an Idempotency-Key header to make a retry a no-op.',
		security: secured,
		request: {
			params: z.object({ id: z.string() })
		},
		responses: {
			200: {
				description: 'OK',
				content: { 'application/json': { schema: CompleteResponse } }
			},
			401: errorResponse('Missing or invalid token'),
			403: errorResponse('noActiveShift / notAssigned'),
			404: errorResponse('Not found (unknown id or a companion this token cannot access)'),
			409: errorResponse('alreadyCompleted / idempotencyKeyReused'),
			429: errorResponse('Rate limited')
		}
	});

	registry.registerPath({
		method: 'post',
		path: '/api/reminders/{id}/skip',
		tags: ['reminders'],
		summary: 'Skip a recurring reminder occurrence',
		description:
			'Resolves the current occurrence without a done record and spawns the next occurrence (nextReminderId). Only recurring reminders can be skipped. Send an Idempotency-Key header to make a retry a no-op.',
		security: secured,
		request: {
			params: z.object({ id: z.string() })
		},
		responses: {
			200: {
				description: 'OK',
				content: { 'application/json': { schema: SkipResponse } }
			},
			400: errorResponse('notRecurring'),
			401: errorResponse('Missing or invalid token'),
			403: errorResponse('noActiveShift / notAssigned'),
			404: errorResponse('Not found (unknown id or a companion this token cannot access)'),
			409: errorResponse('alreadyCompleted / idempotencyKeyReused'),
			429: errorResponse('Rate limited')
		}
	});

	registry.registerPath({
		method: 'get',
		path: '/api/shifts',
		tags: ['shifts'],
		summary: 'List the caretaker shift schedule',
		description:
			'Most recent shifts first; use from/to to window further back. Paginated with limit/offset; see hasMore. admin/member see every shift; a caretaker sees only their own. Requires a full-scope token.',
		security: secured,
		request: {
			query: z.object({
				from: z.string().optional().openapi({ description: 'YYYY-MM-DD; filters by shift end.' }),
				to: z.string().optional().openapi({ description: 'YYYY-MM-DD; filters by shift start.' }),
				...paginationQuery
			})
		},
		responses: {
			200: { description: 'OK', content: { 'application/json': { schema: ShiftList } } },
			400: errorResponse('invalidDate / invalidPagination'),
			401: errorResponse('Missing or invalid token'),
			403: errorResponse('writeScopeReadOnly'),
			404: errorResponse('API disabled'),
			429: errorResponse('Rate limited')
		}
	});

	registry.registerPath({
		method: 'get',
		path: '/api/users',
		tags: ['users'],
		summary: 'List the user roster, scoped to what the token user may see',
		description:
			'Role-scoped visibility: an admin token sees every user; a member token sees everyone except admins; a caretaker token sees only themselves. Paginated with limit/offset; see hasMore. Requires a full-scope token.',
		security: secured,
		request: {
			query: z.object({
				...paginationQuery
			})
		},
		responses: {
			200: { description: 'OK', content: { 'application/json': { schema: UserList } } },
			400: errorResponse('invalidPagination'),
			401: errorResponse('Missing or invalid token'),
			403: errorResponse('writeScopeReadOnly'),
			404: errorResponse('API disabled'),
			429: errorResponse('Rate limited')
		}
	});

	const noteIdParam = z.object({ id: z.string() });

	registry.registerPath({
		method: 'get',
		path: '/api/notes',
		tags: ['notes'],
		summary: "List a companion's notes",
		description:
			'Pinned first, then most recently updated. Paginated with limit/offset; see hasMore. Requires a full-scope token; caretaker tokens get 403.',
		security: secured,
		request: {
			query: z.object({
				companionId: z.string().openapi({ description: 'Required target companion.' }),
				tag: z.string().optional().openapi({ description: 'Only notes with this tag.' }),
				pinned: z.enum(['true', 'false']).optional(),
				...paginationQuery
			})
		},
		responses: {
			200: { description: 'OK', content: { 'application/json': { schema: NoteList } } },
			400: errorResponse('noCompanions / invalidPinned / invalidPagination'),
			401: errorResponse('Missing or invalid token'),
			403: errorResponse('writeScopeReadOnly / forbidden / notAssigned'),
			404: errorResponse('API disabled'),
			429: errorResponse('Rate limited')
		}
	});

	registry.registerPath({
		method: 'post',
		path: '/api/notes',
		tags: ['notes'],
		summary: 'Create a note',
		description:
			'Creates one note for a companion. Requires a full-scope token; caretaker tokens get 403. Send an Idempotency-Key header to make a retry a no-op.',
		security: secured,
		request: {
			body: { content: { 'application/json': { schema: NoteCreate } }, required: true }
		},
		responses: {
			201: {
				description: 'Created',
				content: { 'application/json': { schema: NoteWriteResponse } }
			},
			400: errorResponse(
				'titleRequired / titleTooLong / invalidTitle / bodyTooLong / tooManyTags / invalidTag / noTargets'
			),
			401: errorResponse('Missing or invalid token'),
			403: errorResponse('writeScopeReadOnly / forbidden'),
			404: errorResponse('API disabled'),
			409: errorResponse('idempotencyKeyReused'),
			429: errorResponse('Rate limited')
		}
	});

	registry.registerPath({
		method: 'get',
		path: '/api/notes/{id}',
		tags: ['notes'],
		summary: 'Read one note',
		security: secured,
		request: { params: noteIdParam },
		responses: {
			200: { description: 'OK', content: { 'application/json': { schema: Note } } },
			401: errorResponse('Missing or invalid token'),
			403: errorResponse('writeScopeReadOnly / forbidden'),
			404: errorResponse('notFound (also for notes on companions the token cannot access)'),
			429: errorResponse('Rate limited')
		}
	});

	registry.registerPath({
		method: 'patch',
		path: '/api/notes/{id}',
		tags: ['notes'],
		summary: 'Update a note',
		description:
			'Partial update; fields left out are unchanged. `tags` replaces the whole set. Safe to retry: the same body gives the same result.',
		security: secured,
		request: {
			params: noteIdParam,
			body: { content: { 'application/json': { schema: NoteUpdate } }, required: true }
		},
		responses: {
			200: { description: 'OK', content: { 'application/json': { schema: Note } } },
			400: errorResponse(
				'titleRequired / titleTooLong / invalidTitle / bodyTooLong / tooManyTags / invalidTag'
			),
			401: errorResponse('Missing or invalid token'),
			403: errorResponse('writeScopeReadOnly / forbidden'),
			404: errorResponse('notFound'),
			429: errorResponse('Rate limited')
		}
	});

	registry.registerPath({
		method: 'delete',
		path: '/api/notes/{id}',
		tags: ['notes'],
		summary: 'Delete a note',
		description: 'Not idempotent: retrying after a lost response returns 404.',
		security: secured,
		request: { params: noteIdParam },
		responses: {
			204: { description: 'Deleted' },
			401: errorResponse('Missing or invalid token'),
			403: errorResponse('writeScopeReadOnly / forbidden'),
			404: errorResponse('notFound'),
			429: errorResponse('Rate limited')
		}
	});

	const generator = new OpenApiGeneratorV31(registry.definitions);
	return generator.generateDocument({
		openapi: '3.1.0',
		info: {
			// API contract version, versioned independently of the app's release
			// number: bump minor for additive changes, major for breaking ones.
			title: 'EinVault API',
			version: '1.2.0',
			description:
				'Headless HTTP API for smart buttons, scripts, and devices: log events and journal entries, record health and weight, list and complete reminders, manage notes, and read companions, shifts, and the user roster.'
		},
		servers: [{ url: '/' }]
	});
}
