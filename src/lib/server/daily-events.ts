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

// Species rule shared by every daily-event write path: a target that can't
// have this activity type rejects the whole request (callers only offer
// valid targets, so this is a client bug or a stale API payload). On success,
// subtypes are narrowed per companion, keyed by companion id so callers can
// build their own rows (some, like the journal's backfill path, insert rows
// for ids that were never authorized/species-checked as a group).
// With rejectUnusableSubtypes (the Bearer API), a requested subtype that no id
// can take is an `invalidSubtype` error instead of being dropped silently.
export async function checkSpeciesAndNarrow(
	ids: string[],
	type: DailyEventType,
	subtypes: string[] | null | undefined,
	opts: { rejectUnusableSubtypes?: boolean } = {}
): Promise<
	| { ok: true; subtypesById: Map<string, string[] | null> }
	| { ok: false; code: 'typeNotAllowedForSpecies' | 'invalidSubtype' }
> {
	const speciesRows = await db.query.companions.findMany({
		where: inArray(schema.companions.id, ids),
		columns: { id: true, species: true }
	});
	const speciesById = new Map(speciesRows.map((r) => [r.id, toSpecies(r.species)]));
	if (ids.some((id) => !isActivityAllowed(speciesById.get(id) ?? 'dog', type)))
		return { ok: false, code: 'typeNotAllowedForSpecies' };

	const requested = new Set(subtypes ?? []);
	if (opts.rejectUnusableSubtypes && requested.size > 0) {
		const usable = new Set(ids.flatMap((id) => subtypesFor(speciesById.get(id) ?? 'dog', type)));
		if ([...requested].some((v) => !usable.has(v))) return { ok: false, code: 'invalidSubtype' };
	}
	const subtypesById = new Map(
		ids.map((cid) => {
			const allowed = subtypesFor(speciesById.get(cid) ?? 'dog', type);
			const list = allowed.filter((v) => requested.has(v));
			return [cid, list.length ? list : null] as const;
		})
	);
	return { ok: true, subtypesById };
}

// Insert one daily_events row per authorized companion; rows from a single
// submission share an eventGroupId so multi-companion logs stay linked.
export async function logDailyEvent(
	user: { id: string; role: UserRole },
	companionIds: string[],
	input: DailyEventInput,
	opts: { rejectUnusableSubtypes?: boolean } = {}
): Promise<
	{ ok: true; ids: string[]; eventGroupId: string | null } | { ok: false; code: CareErrorCode }
> {
	const resolved = await authorizeCompanions(user, companionIds);
	if (!resolved.ok) return resolved;

	const checked = await checkSpeciesAndNarrow(resolved.ids, input.type, input.subtypes, opts);
	if (!checked.ok) return checked;

	const durationMinutes = ACTIVITY_HAS_DURATION[input.type] ? input.durationMinutes : null;
	const eventGroupId = resolved.ids.length > 1 ? generateId(15) : null;
	const rows = resolved.ids.map((cid) => ({
		id: generateId(15),
		companionId: cid,
		type: input.type,
		notes: input.notes,
		durationMinutes,
		subtypes: checked.subtypesById.get(cid) ?? null,
		loggedAt: input.loggedAt,
		loggedBy: user.id,
		eventGroupId
	}));

	await db.insert(schema.dailyEvents).values(rows);

	return { ok: true, ids: rows.map((r) => r.id), eventGroupId };
}
