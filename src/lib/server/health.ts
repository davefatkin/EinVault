import { db, schema } from '$lib/server/db';
import { generateId } from '$lib/server/utils';
import type { HealthEventType } from '$lib/server/validation';

export interface HealthEventInput {
	type: HealthEventType;
	title: string;
	notes: string | null;
	occurredAt: Date;
	vetName: string | null;
	vetClinic: string | null;
}

// Pure insert: one health_events row. Scope/permission checks are the caller's
// responsibility (the form enforces access via the companion layout; the API
// route calls authorizeCompanions), so both write paths share this one insert.
export async function createHealthEvent(
	companionId: string,
	input: HealthEventInput,
	loggedBy: string | null
): Promise<string> {
	const id = generateId(15);
	await db.insert(schema.healthEvents).values({ id, companionId, ...input, loggedBy });
	return id;
}
