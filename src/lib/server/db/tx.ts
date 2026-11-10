import type { db } from '#lib/server/db/index.js';

/** A synchronous better-sqlite3 transaction handle. */
export type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
