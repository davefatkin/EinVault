// Client-safe constants for the Reminder undo window. Imported by both
// server-only code (src/lib/server/env.ts, server actions) and the
// client-side ReminderUndoCard. Must not import any $env or $lib/server
// modules so it stays browser-bundle safe.

export const REMINDER_UNDO_PRESETS: readonly number[] = [0, 3, 7, 15];

/**
 * Upper bound for the reminder undo window, in seconds. Values above this
 * are clamped, both at env-resolution time and when reading user prefs that
 * may have been stored before validation tightening.
 */
export const REMINDER_UNDO_MAX_SECONDS = 60;

/**
 * Sentinel value used by the settings form to signal "use the site default
 * (env-resolved) value" rather than overriding it. Shared between the server
 * validator and the client form so the contract has one source of truth.
 */
export const REMINDER_UNDO_DEFAULT_SENTINEL = 'default';
