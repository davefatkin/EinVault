import { parseSpecies, parseWeightUnit } from '$lib/server/validation';
import { defaultWeightUnit } from '$lib/species';
import type { Species, WeightUnit } from '$lib/activityTypes';

// Species + weight unit from the companion form. Create (no `current`) requires
// a species and defaults the unit from it; edit keeps stored values for any
// missing field so a partial post never resets them.
export function parseCompanionSpeciesAndUnit(
	data: FormData,
	current?: { species: Species; weightUnit: WeightUnit }
): { ok: true; species: Species; weightUnit: WeightUnit } | { ok: false } {
	const species = parseSpecies(String(data.get('species') ?? '')) ?? current?.species ?? null;
	if (!species) return { ok: false };
	const fallback = current?.weightUnit ?? defaultWeightUnit(species);
	return {
		ok: true,
		species,
		weightUnit: parseWeightUnit(String(data.get('weightUnit') ?? ''), fallback)
	};
}
