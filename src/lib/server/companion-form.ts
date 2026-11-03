import { isValidDate, parseSpecies, parseWeightUnit } from '#lib/server/validation.js';
import { defaultWeightUnit } from '#lib/species.js';
import type { Species, WeightUnit } from '#lib/activityTypes.js';

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

// Birth and homecoming dates from the companion form. Both must be real
// YYYY-MM-DD dates no later than `today` (the server's local date). An empty
// dob forces "approximate" off. No ordering check between the two: a guessed
// dob can land after a real homecoming.
export function parseCompanionDates(
	data: FormData,
	today: string
):
	| { ok: true; dob: string | null; dobApproximate: boolean; homecomingDate: string | null }
	| { ok: false; error: 'invalidDob' | 'invalidHomecoming' } {
	const dob = String(data.get('dob') ?? '').trim() || null;
	const homecomingDate = String(data.get('homecomingDate') ?? '').trim() || null;
	if (dob && (!isValidDate(dob) || dob > today)) return { ok: false, error: 'invalidDob' };
	if (homecomingDate && (!isValidDate(homecomingDate) || homecomingDate > today))
		return { ok: false, error: 'invalidHomecoming' };
	return {
		ok: true,
		dob,
		dobApproximate: dob !== null && data.has('dobApproximate'),
		homecomingDate
	};
}
