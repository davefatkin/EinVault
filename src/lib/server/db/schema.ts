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
		reminderUndoSeconds: integer('reminder_undo_seconds')
	},
	(t) => [uniqueIndex('users_oidc_idx').on(t.oidcIssuer, t.oidcSubject)]
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
		loggedBy: text('logged_by').references(() => users.id, { onDelete: 'set null' })
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
		originalName: text('original_name'),
		mimeType: text('mime_type').notNull(),
		sizeBytes: integer('size_bytes').notNull(),
		notes: text('notes'),
		createdAt: integer('created_at', { mode: 'timestamp' })
			.notNull()
			.default(sql`(unixepoch())`),
		loggedBy: text('logged_by').references(() => users.id, { onDelete: 'set null' })
	},
	(t) => ({
		entryIdx: index('photo_entry_idx').on(t.entryId)
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
			enum: ['vet_visit', 'vaccination', 'medication', 'weight', 'procedure', 'other']
		}).notNull(),
		title: text('title').notNull(),
		notes: text('notes'),
		occurredAt: integer('occurred_at', { mode: 'timestamp' }).notNull(),
		nextDueAt: integer('next_due_at', { mode: 'timestamp' }),
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
		loggedBy: text('logged_by').references(() => users.id, { onDelete: 'set null' })
	},
	(t) => ({
		companionIdx: index('daily_companion_idx').on(t.companionId),
		loggedIdx: index('daily_logged_idx').on(t.loggedAt)
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
		recurringDays: integer('recurring_days'),
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
export type Companion = typeof companions.$inferSelect;
export type JournalEntry = typeof journalEntries.$inferSelect;
export type JournalPhoto = typeof journalPhotos.$inferSelect;
export type HealthEvent = typeof healthEvents.$inferSelect;
export type WeightEntry = typeof weightEntries.$inferSelect;
export type DailyEvent = typeof dailyEvents.$inferSelect;
export type Reminder = typeof reminders.$inferSelect;
export type CompanionCaretaker = typeof companionCaretakers.$inferSelect;
export type CaretakerShift = typeof caretakerShifts.$inferSelect;

// relations

export const sessionsRelations = relations(sessions, ({ one }) => ({
	user: one(users, { fields: [sessions.userId], references: [users.id] })
}));

export const usersRelations = relations(users, ({ many }) => ({
	sessions: many(sessions),
	companionCaretakers: many(companionCaretakers),
	shifts: many(caretakerShifts),
	loggedJournalEntries: many(journalEntries),
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
	logger: one(users, { fields: [journalEntries.loggedBy], references: [users.id] }),
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

export const healthEventsRelations = relations(healthEvents, ({ one }) => ({
	logger: one(users, { fields: [healthEvents.loggedBy], references: [users.id] })
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
