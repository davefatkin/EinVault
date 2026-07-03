// Hard caps on free-text fields, shared by the API and form paths. These live
// in $lib (not env) because they are storage-shape guarantees, not operator
// tunables: raising them risks oversized rows and unbounded request bodies.
// $lib/server/env.ts re-exports these for server callers.

export const MAX_NOTE_LEN = 5000;
export const MAX_JOURNAL_BODY_LEN = 20000;
