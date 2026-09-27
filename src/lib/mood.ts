// Client-safe mood enum. Keep in step with journal_entries.mood in schema.ts.
export const MOODS = ['great', 'good', 'meh', 'off', 'sick'] as const;
export type Mood = (typeof MOODS)[number];
