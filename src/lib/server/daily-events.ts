import { inArray } from 'drizzle-orm';
import { db, schema } from '$lib/server/db';
import { generateId } from '$lib/server/utils';
import { authorizeCompanions } from '$lib/server/companion-scope';
import { ACTIVITY_HAS_DURATION } from '$lib/i18n/labels';
import { isActivityAllowed, subtypesFor, toSpecies } from '$lib/species';
import type { DailyEventType, UserRole } from '$lib/server/validation';
import type { CareErrorCode } from '$lib/server/care-errors';

export interface DailyEventInput {
	type: DailyEventType;
	notes: string | null;
	durationMinutes: number | null;
	loggedAt: Date;
	subtypes?: string[] | null;
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

	// Species rule: an explicit target that can't have this activity rejects the
	// whole request (callers only offer valid targets, so this is a client bug
	// or a stale API payload). Subtypes are then narrowed per row.
	const speciesRows = await db.query.companions.findMany({
		where: inArray(schema.companions.id, resolved.ids),
		columns: { id: true, species: true }
	});
	const speciesById = new Map(speciesRows.map((r) => [r.id, toSpecies(r.species)]));
	if (resolved.ids.some((id) => !isActivityAllowed(speciesById.get(id) ?? 'dog', input.type)))
		return { ok: false, code: 'typeNotAllowedForSpecies' };

	const durationMinutes = ACTIVITY_HAS_DURATION[input.type] ? input.durationMinutes : null;
	const requested = new Set(input.subtypes ?? []);
	const eventGroupId = resolved.ids.length > 1 ? generateId(15) : null;
	const rows = resolved.ids.map((cid) => {
		const allowed = subtypesFor(speciesById.get(cid) ?? 'dog', input.type);
		const list = allowed.filter((v) => requested.has(v));
		return {
			id: generateId(15),
			companionId: cid,
			type: input.type,
			notes: input.notes,
			durationMinutes,
			subtypes: list.length ? list : null,
			loggedAt: input.loggedAt,
			loggedBy: user.id,
			eventGroupId
		};
	});

	await db.insert(schema.dailyEvents).values(rows);

	return { ok: true, ids: rows.map((r) => r.id), eventGroupId };
}
