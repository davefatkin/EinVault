/** Lightweight author info attached to loggable entities via Drizzle's `with: { logger }` relation. */
export type Logger = { displayName: string } | null;
