import { and, eq } from 'drizzle-orm';
import { db, schema } from '$lib/server/db';
import { parseSubtypes } from '$lib/activitySubtypes';
import { isActivityAllowed, subtypesFor, toSpecies } from '$lib/species';
import type { DailyEventType } from '$lib/activityTypes';

// Journal edit rules: an event keeps its stored type even if the companion's
// species no longer allows it (validated against the global subtype list so
// nothing is dropped); changing the type must pick one the species allows.
export async function resolveActivityUpdate(
	companionId: string,
	eventId: string,
	type: DailyEventType,
	rawSubtypes: unknown
): Promise<
	| { ok: true; subtypes: string[] | null }
	| { ok: false; code: 'notFound' | 'typeNotAllowedForSpecies' }
> {
	const existing = await db.query.dailyEvents.findFirst({
		where: and(eq(schema.dailyEvents.id, eventId), eq(schema.dailyEvents.companionId, companionId)),
		columns: { id: true, type: true }
	});
	if (!existing) return { ok: false, code: 'notFound' };

	if (existing.type === type) {
		const list = parseSubtypes(type, rawSubtypes);
		return { ok: true, subtypes: list.length ? list : null };
	}

	const companion = await db.query.companions.findFirst({
		where: eq(schema.companions.id, companionId),
		columns: { species: true }
	});
	const species = toSpecies(companion?.species);
	if (!isActivityAllowed(species, type)) return { ok: false, code: 'typeNotAllowedForSpecies' };
	const chosen = new Set(parseSubtypes(type, rawSubtypes));
	const list = subtypesFor(species, type).filter((v) => chosen.has(v));
	return { ok: true, subtypes: list.length ? list : null };
}
