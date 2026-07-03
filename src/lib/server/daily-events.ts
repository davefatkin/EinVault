import { and, eq, inArray } from 'drizzle-orm';
import { db, schema } from '$lib/server/db';
import { generateId } from '$lib/server/utils';
import { getShiftStatus } from '$lib/server/shifts';
import { ACTIVITY_HAS_DURATION } from '$lib/i18n/labels';
import type { DailyEventType, UserRole } from '$lib/server/validation';

export interface DailyEventInput {
	type: DailyEventType;
	notes: string | null;
	durationMinutes: number | null;
	loggedAt: Date;
}

export type LogDailyEventError = 'noTargets' | 'notAssigned' | 'noActiveShift';

type ResolveResult = { ok: true; ids: string[] } | { ok: false; code: LogDailyEventError };

// Authorization core shared by form actions and the token API.
// - member/admin: any existing active companion
// - caretaker: must be on shift, and every id must be an assigned companion
//   (mirrors the original caretaker quick-log action; unassigned or archived
//   ids are silently dropped, matching the old "also log for" behavior, but
//   an empty result is an error so a bad primary target can't no-op).
export async function resolveLoggableCompanions(
	user: { id: string; role: UserRole },
	companionIds: string[]
): Promise<ResolveResult> {
	const requested = [...new Set(companionIds.filter(Boolean))];
	if (requested.length === 0) return { ok: false, code: 'noTargets' };

	if (user.role === 'caretaker') {
		const { isOnShift } = await getShiftStatus(user.id);
		if (!isOnShift) return { ok: false, code: 'noActiveShift' };

		const assignedRows = await db.query.companionCaretakers.findMany({
			where: and(
				eq(schema.companionCaretakers.userId, user.id),
				inArray(schema.companionCaretakers.companionId, requested)
			),
			columns: { companionId: true }
		});
		const assignedIds = assignedRows.map((r) => r.companionId);
		if (assignedIds.length === 0) return { ok: false, code: 'notAssigned' };

		const activeRows = await db.query.companions.findMany({
			where: and(inArray(schema.companions.id, assignedIds), eq(schema.companions.isActive, true)),
			columns: { id: true }
		});
		const ids = activeRows.map((r) => r.id);
		return ids.length > 0 ? { ok: true, ids } : { ok: false, code: 'notAssigned' };
	}

	const activeRows = await db.query.companions.findMany({
		where: and(inArray(schema.companions.id, requested), eq(schema.companions.isActive, true)),
		columns: { id: true }
	});
	const ids = activeRows.map((r) => r.id);
	return ids.length > 0 ? { ok: true, ids } : { ok: false, code: 'noTargets' };
}

// Insert one daily_events row per authorized companion; rows from a single
// submission share an eventGroupId so multi-companion logs stay linked.
export async function logDailyEvent(
	user: { id: string; role: UserRole },
	companionIds: string[],
	input: DailyEventInput
): Promise<
	{ ok: true; ids: string[]; eventGroupId: string | null } | { ok: false; code: LogDailyEventError }
> {
	const resolved = await resolveLoggableCompanions(user, companionIds);
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
