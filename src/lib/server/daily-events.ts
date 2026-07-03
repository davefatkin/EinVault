import { db, schema } from '$lib/server/db';
import { generateId } from '$lib/server/utils';
import { authorizeCompanions } from '$lib/server/companion-scope';
import { ACTIVITY_HAS_DURATION } from '$lib/i18n/labels';
import type { DailyEventType, UserRole } from '$lib/server/validation';
import type { CareErrorCode } from '$lib/server/care-errors';

export interface DailyEventInput {
	type: DailyEventType;
	notes: string | null;
	durationMinutes: number | null;
	loggedAt: Date;
}

// Insert one daily_events row per authorized companion; rows from a single
// submission share an eventGroupId so multi-companion logs stay linked.
export async function logDailyEvent(
	user: { id: string; role: UserRole },
	companionIds: string[],
	input: DailyEventInput
): Promise<
	{ ok: true; ids: string[]; eventGroupId: string | null } | { ok: false; code: CareErrorCode }
> {
	const resolved = await authorizeCompanions(user, companionIds);
	if (!resolved.ok) return resolved;

	const durationMinutes = ACTIVITY_HAS_DURATION[input.type] ? input.durationMinutes : null;
	const eventGroupId = resolved.ids.length > 1 ? generateId(15) : null;
	const rows = resolved.ids.map((cid) => ({
		id: generateId(15),
		companionId: cid,
		type: input.type,
		notes: input.notes,
		durationMinutes,
		loggedAt: input.loggedAt,
		loggedBy: user.id,
		eventGroupId
	}));

	await db.insert(schema.dailyEvents).values(rows);

	return { ok: true, ids: rows.map((r) => r.id), eventGroupId };
}
