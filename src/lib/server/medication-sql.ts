import { sql } from 'drizzle-orm';
import { schema } from '#lib/server/db/index.js';

/** SQL for "active on `today`": no end date, or ending today or later. */
export function medicationActiveSql(today: string) {
	return sql`(${schema.medications.endedOn} is null or ${schema.medications.endedOn} >= ${today})`;
}
