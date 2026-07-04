import { db, schema } from '$lib/server/db';
import { generateId } from '$lib/server/utils';
import type { WeightUnit } from '$lib/server/validation';

export interface WeightEntryInput {
	weight: number;
	unit: WeightUnit;
	notes: string | null;
	recordedAt: Date;
}

// Pure insert: one weight_entries row. See health.ts for the scope rationale.
export async function createWeightEntry(
	companionId: string,
	input: WeightEntryInput,
	loggedBy: string | null
): Promise<string> {
	const id = generateId(15);
	await db.insert(schema.weightEntries).values({ id, companionId, ...input, loggedBy });
	return id;
}
