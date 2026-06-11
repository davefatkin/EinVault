import { sql, relations } from 'drizzle-orm';
import {
	integer,
	sqliteTable,
	text,
	uniqueIndex,
	index,
	real,
	primaryKey
} from 'drizzle-orm/sqlite-core';

// users

export const users = sqliteTable(
	'users',
	{
		id: text('id').primaryKey(),
		username: text('username').notNull().unique(),
		displayName: text('display_name').notNull(),
		passwordHash: text('password_hash'),
		calendarFeedToken: text('calendar_feed_token'),
		role: text('role', { enum: ['admin', 'member', 'caretaker'] })
			.notNull()
			.default('member'),
		isActive: integer('is_active', { mode: 'boolean' }).notNull().default(true),
		createdAt: integer('created_at', { mode: 'timestamp' })
			.notNull()
			.default(sql`(unixepoch())`),
		lastLoginAt: integer('last_login_at', { mode: 'timestamp' }),
		theme: text('theme', { enum: ['light', 'dark', 'system'] })
			.notNull()
			.default('system'),
		locale: text('locale', { enum: ['en', 'it', 'de', 'es', 'fr', 'pt'] })
			.notNull()
			.default('en'),
		email: text('email'),
		phone: text('phone'),
		oidcSubject: text('oidc_subject'),
		oidcIssuer: text('oidc_issuer'),
		reminderUndoSeconds: integer('reminder_undo_seconds'),
		defaultRecurrenceUnit: text('default_recurrence_unit', {
			enum: ['day', 'week', 'month', 'year']
		}),
		notifyReminderEmail: integer('notify_reminder_email', { mode: 'boolean' })
			.notNull()
			.default(false),
		notifyShiftEmail: integer('notify_shift_email', { mode: 'boolean' }).notNull().default(false),
		// ntfy topic name on the site-configured server (env NTFY_URL). A
		// non-empty topic is the opt-in for push notifications; the user
		// receives both categories (reminders, shift alerts) within their
		// role's visibility scope. Null = no pushes.
		ntfyTopic: text('ntfy_topic')
	},
	(t) => [
		uniqueIndex('users_oidc_idx').on(t.oidcIssuer, t.oidcSubject),
		uniqueIndex('users_email_idx').on(t.email),
		uniqueIndex('users_calendar_feed_token_idx').on(t.calendarFeedToken)
	]
);

export const sessions = sqliteTable(
	'sessions',
	{
		id: text('id').primaryKey(),
		userId: text('user_id')
			.notNull()
			.references(() => users.id, { onDelete: 'cascade' }),
		expiresAt: integer('expires_at', { mode: 'timestamp' }).notNull(),
		createdAt: integer('created_at', { mode: 'timestamp' })
			.notNull()
			.default(sql`(unixepoch())`),
		oidcIdTokenHint: text('oidc_id_token_hint')
	},
	(t) => [index('session_user_idx').on(t.userId)]
);

export const passwordResetTokens = sqliteTable(
	'password_reset_tokens',
	{
		// sha256 hex of the raw token — same storage pattern as sessions.id, so a
		// DB leak never exposes a usable token.
		id: text('id').primaryKey(),
		userId: text('user_id')
			.notNull()
			.references(() => users.id, { onDelete: 'cascade' }),
		expiresAt: integer('expires_at', { mode: 'timestamp' }).notNull(),
		createdAt: integer('created_at', { mode: 'timestamp' })
			.notNull()
			.default(sql`(unixepoch())`)
	},
	(t) => [index('password_reset_user_idx').on(t.userId)]
);

// Notification outbox (issue #12). Detection (the scheduler's producers) and
// delivery (the drain) are decoupled through this table so a crash, restart,
// or SMTP outage never silently drops a notification. The unique dedupe key
// makes producers idempotent across overlapping scans and restarts.
export type OutboxPayload =
	| { kind: 'reminderDue'; reminderId: string; dueAtEpoch: number }
	| { kind: 'shiftStart'; shiftId: string; boundaryEpoch: number }
	| { kind: 'shiftEnd'; shiftId: string; boundaryEpoch: number };

export const notificationOutbox = sqliteTable(
	'notification_outbox',
	{
		id: text('id').primaryKey(),
		// reminder: 'reminder:{reminderId}:{dueAtEpochSeconds}:{userId}:{channel}'
		// shift:    'shift:{shiftId}:{start|end}:{boundaryEpochSeconds}:{userId}:{channel}'
		// One row per occurrence per recipient per channel.
		dedupeKey: text('dedupe_key').notNull(),
		userId: text('user_id')
			.notNull()
			.references(() => users.id, { onDelete: 'cascade' }),
		channel: text('channel', { enum: ['email', 'ntfy', 'apprise'] }).notNull(),
		// Rendering happens at send time in the recipient's locale; the payload
		// carries ids only.
		payload: text('payload', { mode: 'json' }).$type<OutboxPayload>().notNull(),
		// queued -> claimed -> sent | skipped | failed; claimed rows orphaned by a
		// crash are reset to queued at boot. skipped = conditions no longer hold
		// (reminder completed, user opted out, shift already started) — not an error.
		status: text('status', { enum: ['queued', 'claimed', 'sent', 'skipped', 'failed'] })
			.notNull()
			.default('queued'),
		attempts: integer('attempts').notNull().default(0),
		createdAt: integer('created_at', { mode: 'timestamp' })
			.notNull()
			.default(sql`(unixepoch())`),
		sentAt: integer('sent_at', { mode: 'timestamp' })
	},
	(t) => [uniqueIndex('outbox_dedupe_idx').on(t.dedupeKey), index('outbox_status_idx').on(t.status)]
);

// companions

export const companions = sqliteTable(
	'companions',
	{
		id: text('id').primaryKey(),
		name: text('name').notNull(),
		species: text('species', { enum: ['dog'] })
			.notNull()
			.default('dog'),
		breed: text('breed'),
		dob: text('dob'),
		sex: text('sex', { enum: ['male', 'female', 'unknown'] }),
		weightUnit: text('weight_unit', { enum: ['kg', 'lbs'] })
			.notNull()
			.default('lbs'),
		microchip: text('microchip'),
		avatarPath: text('avatar_path'),
		avatarProvider: text('avatar_provider', { enum: ['local', 's3', 'immich'] })
			.notNull()
			.default('local'),
		avatarStorageKey: text('avatar_storage_key'),
		bio: text('bio'),
		feedingSchedule: text('feeding_schedule'),
		walkSchedule: text('walk_schedule'),
		emergencyContactName: text('emergency_contact_name'),
		emergencyContactPhone: text('emergency_contact_phone'),
		vetName: text('vet_name'),
		vetPhone: text('vet_phone'),
		vetClinic: text('vet_clinic'),
		notesForSitter: text('notes_for_sitter'),
		isActive: integer('is_active', { mode: 'boolean' }).notNull().default(true),
		archivedAt: integer('archived_at', { mode: 'timestamp' }),
		archiveNote: text('archive_note'),
		createdAt: integer('created_at', { mode: 'timestamp' })
			.notNull()
			.default(sql`(unixepoch())`)
	},
	(t) => [index('companion_active_idx').on(t.isActive)]
);

// journal

export const journalEntries = sqliteTable(
	'journal_entries',
	{
		id: text('id').primaryKey(),
		companionId: text('companion_id')
			.notNull()
			.references(() => companions.id, { onDelete: 'cascade' }),
		date: text('date').notNull(),
		body: text('body').notNull().default(''),
		mood: text('mood', { enum: ['great', 'good', 'meh', 'off', 'sick'] }),
		createdAt: integer('created_at', { mode: 'timestamp' })
			.notNull()
			.default(sql`(unixepoch())`),
		updatedAt: integer('updated_at', { mode: 'timestamp' })
			.notNull()
			.default(sql`(unixepoch())`),
		loggedBy: text('logged_by').references(() => users.id, { onDelete: 'set null' }),
		updatedBy: text('updated_by').references(() => users.id, { onDelete: 'set null' })
	},
	(t) => ({
		uniquePerDay: uniqueIndex('journal_companion_date_idx').on(t.companionId, t.date)
	})
);

export const journalPhotos = sqliteTable(
	'journal_photos',
	{
		id: text('id').primaryKey(),
		entryId: text('entry_id')
			.notNull()
			.references(() => journalEntries.id, { onDelete: 'cascade' }),
		filename: text('filename').notNull(),
		provider: text('provider', { enum: ['local', 's3', 'immich'] })
			.notNull()
			.default('local'),
		storageKey: text('storage_key'),
		originalName: text('original_name'),
		mediaType: text('media_type', { enum: ['photo', 'video'] })
			.notNull()
			.default('photo'),
		mimeType: text('mime_type').notNull(),
		sizeBytes: integer('size_bytes').notNull(),
		notes: text('notes'),
		// Transcode lifecycle. 'ready' = playable as stored (the default for
		// every pre-existing row and for any media that isn't queued for
		// transcoding). 'processing' = enqueued, awaiting the worker. 'claimed'
		// = a worker has atomically taken the job (crash-recovery marker).
		// 'failed' = transcode gave up; UI falls back to a download link. Only
		// VIDEO_TRANSCODE=true ever produces non-'ready' values.
		status: text('status', { enum: ['ready', 'processing', 'claimed', 'failed'] })
			.notNull()
			.default('ready'),
		// Storage key of the kept source video (VIDEO_KEEP_ORIGINAL=true). Never
		// served to clients; retained for re-encode/backup only.
		originalKey: text('original_key'),
		// Storage key of the generated poster/thumbnail JPEG.
		posterKey: text('poster_key'),
		// Times the worker has attempted this job. Bounds retries so a poison
		// input can't be requeued forever on every boot.
		transcodeAttempts: integer('transcode_attempts').notNull().default(0),
		createdAt: integer('created_at', { mode: 'timestamp' })
			.notNull()
			.default(sql`(unixepoch())`),
		loggedBy: text('logged_by').references(() => users.id, { onDelete: 'set null' })
	},
	(t) => ({
		entryIdx: index('photo_entry_idx').on(t.entryId),
		// The worker scans for queued jobs by status; index it.
		statusIdx: index('photo_status_idx').on(t.status)
	})
);

// health log

export const healthEvents = sqliteTable(
	'health_events',
	{
		id: text('id').primaryKey(),
		companionId: text('companion_id')
			.notNull()
			.references(() => companions.id, { onDelete: 'cascade' }),
		type: text('type', {
			enum: ['vet_visit', 'vaccination', 'medication', 'procedure', 'other']
		}).notNull(),
		title: text('title').notNull(),
		notes: text('notes'),
		occurredAt: integer('occurred_at', { mode: 'timestamp' }).notNull(),
		vetName: text('vet_name'),
		vetClinic: text('vet_clinic'),
		createdAt: integer('created_at', { mode: 'timestamp' })
			.notNull()
			.default(sql`(unixepoch())`),
		loggedBy: text('logged_by').references(() => users.id, { onDelete: 'set null' })
	},
	(t) => ({
		companionIdx: index('health_companion_idx').on(t.companionId),
		typeIdx: index('health_type_idx').on(t.type)
	})
);

// companion documents (issue #95)

export const documents = sqliteTable(
	'documents',
	{
		id: text('id').primaryKey(),
		companionId: text('companion_id')
			.notNull()
			.references(() => companions.id, { onDelete: 'cascade' }),
		// Optional link to a health event of the SAME companion. App code
		// validates the companion match on every write (SQLite can't express
		// the composite constraint cleanly).
		healthEventId: text('health_event_id').references(() => healthEvents.id, {
			onDelete: 'set null'
		}),
		// `{documentId}.{ext}` — server-generated, never derived from the
		// uploaded filename. Used in /api/documents URLs.
		filename: text('filename').notNull(),
		provider: text('provider', { enum: ['local', 's3', 'paperless'] })
			.notNull()
			.default('local'),
		storageKey: text('storage_key').notNull(),
		title: text('title').notNull(),
		category: text('category', {
			enum: ['receipt', 'invoice', 'medical', 'insurance', 'ownership', 'other']
		})
			.notNull()
			.default('other'),
		// User-set document date (receipt date), not upload date. YYYY-MM-DD.
		documentDate: text('document_date'),
		originalName: text('original_name'),
		mimeType: text('mime_type').notNull(),
		sizeBytes: integer('size_bytes'),
		createdAt: integer('created_at', { mode: 'timestamp' })
			.notNull()
			.default(sql`(unixepoch())`),
		uploadedBy: text('uploaded_by').references(() => users.id, { onDelete: 'set null' })
	},
	(t) => ({
		companionIdx: index('document_companion_idx').on(t.companionId),
		healthEventIdx: index('document_health_event_idx').on(t.healthEventId)
	})
);

export const weightEntries = sqliteTable(
	'weight_entries',
	{
		id: text('id').primaryKey(),
		companionId: text('companion_id')
			.notNull()
			.references(() => companions.id, { onDelete: 'cascade' }),
		weight: real('weight').notNull(),
		unit: text('unit', { enum: ['kg', 'lbs'] }).notNull(),
		recordedAt: integer('recorded_at', { mode: 'timestamp' }).notNull(),
		notes: text('notes'),
		createdAt: integer('created_at', { mode: 'timestamp' })
			.notNull()
			.default(sql`(unixepoch())`),
		loggedBy: text('logged_by').references(() => users.id, { onDelete: 'set null' })
	},
	(t) => ({
		companionIdx: index('weight_companion_idx').on(t.companionId)
	})
);

// daily log

export const dailyEvents = sqliteTable(
	'daily_events',
	{
		id: text('id').primaryKey(),
		companionId: text('companion_id')
			.notNull()
			.references(() => companions.id, { onDelete: 'cascade' }),
		type: text('type', {
			enum: ['walk', 'meal', 'bathroom', 'treat', 'play', 'grooming', 'other']
		}).notNull(),
		notes: text('notes'),
		durationMinutes: integer('duration_minutes'),
		loggedAt: integer('logged_at', { mode: 'timestamp' }).notNull(),
		createdAt: integer('created_at', { mode: 'timestamp' })
			.notNull()
			.default(sql`(unixepoch())`),
		loggedBy: text('logged_by').references(() => users.id, { onDelete: 'set null' }),
		eventGroupId: text('event_group_id')
	},
	(t) => ({
		companionIdx: index('daily_companion_idx').on(t.companionId),
		loggedIdx: index('daily_logged_idx').on(t.loggedAt),
		groupIdx: index('daily_event_group_idx').on(t.eventGroupId)
	})
);

// reminders

export const reminders = sqliteTable(
	'reminders',
	{
		id: text('id').primaryKey(),
		companionId: text('companion_id')
			.notNull()
			.references(() => companions.id, { onDelete: 'cascade' }),
		title: text('title').notNull(),
		description: text('description'),
		type: text('type', {
			enum: ['vet', 'medication', 'vaccination', 'grooming', 'other']
		}).notNull(),
		dueAt: integer('due_at', { mode: 'timestamp' }).notNull(),
		isRecurring: integer('is_recurring', { mode: 'boolean' }).notNull().default(false),
		recurrenceUnit: text('recurrence_unit', { enum: ['day', 'week', 'month', 'year'] }),
		recurrenceInterval: integer('recurrence_interval'),
		recurrenceAnchor: text('recurrence_anchor', {
			enum: ['interval', 'day_of_week', 'day_of_month', 'day_of_year']
		}),
		recurrenceAnchorValue: integer('recurrence_anchor_value'),
		seriesId: text('series_id'),
		completedAt: integer('completed_at', { mode: 'timestamp' }),
		completedBy: text('completed_by').references(() => users.id, { onDelete: 'set null' }),
		createdAt: integer('created_at', { mode: 'timestamp' })
			.notNull()
			.default(sql`(unixepoch())`),
		loggedBy: text('logged_by').references(() => users.id, { onDelete: 'set null' })
	},
	(t) => ({
		companionIdx: index('reminder_companion_idx').on(t.companionId),
		dueIdx: index('reminder_due_idx').on(t.dueAt),
		seriesDueIdx: index('reminder_series_due_idx').on(t.seriesId, t.dueAt)
	})
);

// companion <-> caretaker assignments

export const companionCaretakers = sqliteTable(
	'companion_caretakers',
	{
		companionId: text('companion_id')
			.notNull()
			.references(() => companions.id, { onDelete: 'cascade' }),
		userId: text('user_id')
			.notNull()
			.references(() => users.id, { onDelete: 'cascade' })
	},
	(t) => ({
		pk: primaryKey({ columns: [t.companionId, t.userId] })
	})
);

// caretaker shifts

export const caretakerShifts = sqliteTable(
	'caretaker_shifts',
	{
		id: text('id').primaryKey(),
		userId: text('user_id')
			.notNull()
			.references(() => users.id, { onDelete: 'cascade' }),
		startAt: integer('start_at', { mode: 'timestamp' }).notNull(),
		endAt: integer('end_at', { mode: 'timestamp' }).notNull(),
		notes: text('notes'),
		createdAt: integer('created_at', { mode: 'timestamp' })
			.notNull()
			.default(sql`(unixepoch())`)
	},
	(t) => ({
		userIdx: index('shift_user_idx').on(t.userId)
	})
);

// type exports

export type User = typeof users.$inferSelect;
export type Session = typeof sessions.$inferSelect;
export type PasswordResetToken = typeof passwordResetTokens.$inferSelect;
export type NotificationOutboxRow = typeof notificationOutbox.$inferSelect;
export type Companion = typeof companions.$inferSelect;
export type JournalEntry = typeof journalEntries.$inferSelect;
export type JournalPhoto = typeof journalPhotos.$inferSelect;
export type HealthEvent = typeof healthEvents.$inferSelect;
export type Document = typeof documents.$inferSelect;
export type WeightEntry = typeof weightEntries.$inferSelect;
export type DailyEvent = typeof dailyEvents.$inferSelect;
export type Reminder = typeof reminders.$inferSelect;
export type CompanionCaretaker = typeof companionCaretakers.$inferSelect;
export type CaretakerShift = typeof caretakerShifts.$inferSelect;

// relations

export const sessionsRelations = relations(sessions, ({ one }) => ({
	user: one(users, { fields: [sessions.userId], references: [users.id] })
}));

export const passwordResetTokensRelations = relations(passwordResetTokens, ({ one }) => ({
	user: one(users, { fields: [passwordResetTokens.userId], references: [users.id] })
}));

export const notificationOutboxRelations = relations(notificationOutbox, ({ one }) => ({
	user: one(users, { fields: [notificationOutbox.userId], references: [users.id] })
}));

export const usersRelations = relations(users, ({ many }) => ({
	sessions: many(sessions),
	passwordResetTokens: many(passwordResetTokens),
	notificationOutbox: many(notificationOutbox),
	companionCaretakers: many(companionCaretakers),
	shifts: many(caretakerShifts),
	loggedJournalEntries: many(journalEntries, { relationName: 'journalLogger' }),
	updatedJournalEntries: many(journalEntries, { relationName: 'journalUpdater' }),
	loggedJournalPhotos: many(journalPhotos),
	loggedDailyEvents: many(dailyEvents),
	loggedHealthEvents: many(healthEvents),
	loggedWeightEntries: many(weightEntries),
	loggedReminders: many(reminders, { relationName: 'reminderLogger' }),
	completedReminders: many(reminders, { relationName: 'reminderCompleter' })
}));

export const companionCaretakersRelations = relations(companionCaretakers, ({ one }) => ({
	companion: one(companions, {
		fields: [companionCaretakers.companionId],
		references: [companions.id]
	}),
	user: one(users, { fields: [companionCaretakers.userId], references: [users.id] })
}));

export const caretakerShiftsRelations = relations(caretakerShifts, ({ one }) => ({
	user: one(users, { fields: [caretakerShifts.userId], references: [users.id] })
}));

export const journalEntriesRelations = relations(journalEntries, ({ one, many }) => ({
	logger: one(users, {
		fields: [journalEntries.loggedBy],
		references: [users.id],
		relationName: 'journalLogger'
	}),
	updater: one(users, {
		fields: [journalEntries.updatedBy],
		references: [users.id],
		relationName: 'journalUpdater'
	}),
	photos: many(journalPhotos)
}));

export const journalPhotosRelations = relations(journalPhotos, ({ one }) => ({
	entry: one(journalEntries, {
		fields: [journalPhotos.entryId],
		references: [journalEntries.id]
	}),
	logger: one(users, { fields: [journalPhotos.loggedBy], references: [users.id] })
}));

export const dailyEventsRelations = relations(dailyEvents, ({ one }) => ({
	logger: one(users, { fields: [dailyEvents.loggedBy], references: [users.id] })
}));

export const healthEventsRelations = relations(healthEvents, ({ one, many }) => ({
	logger: one(users, { fields: [healthEvents.loggedBy], references: [users.id] }),
	documents: many(documents)
}));

export const documentsRelations = relations(documents, ({ one }) => ({
	companion: one(companions, { fields: [documents.companionId], references: [companions.id] }),
	healthEvent: one(healthEvents, {
		fields: [documents.healthEventId],
		references: [healthEvents.id]
	}),
	uploader: one(users, { fields: [documents.uploadedBy], references: [users.id] })
}));

export const weightEntriesRelations = relations(weightEntries, ({ one }) => ({
	logger: one(users, { fields: [weightEntries.loggedBy], references: [users.id] })
}));

export const remindersRelations = relations(reminders, ({ one }) => ({
	logger: one(users, {
		fields: [reminders.loggedBy],
		references: [users.id],
		relationName: 'reminderLogger'
	}),
	completer: one(users, {
		fields: [reminders.completedBy],
		references: [users.id],
		relationName: 'reminderCompleter'
	})
}));
