import { describe, it, expect } from 'vitest';
import { parseCompanionSpeciesAndUnit } from './companion-form';

const fd = (o: Record<string, string>) => {
	const f = new FormData();
	for (const [k, v] of Object.entries(o)) f.set(k, v);
	return f;
};

describe('parseCompanionSpeciesAndUnit', () => {
	it('create requires a species', () => {
		expect(parseCompanionSpeciesAndUnit(fd({}))).toEqual({ ok: false });
		expect(parseCompanionSpeciesAndUnit(fd({ species: 'horse' }))).toEqual({ ok: false });
	});
	it('create defaults the unit from species', () => {
		expect(parseCompanionSpeciesAndUnit(fd({ species: 'other' }))).toEqual({
			ok: true,
			species: 'other',
			weightUnit: 'g'
		});
		expect(parseCompanionSpeciesAndUnit(fd({ species: 'cat', weightUnit: 'kg' }))).toEqual({
			ok: true,
			species: 'cat',
			weightUnit: 'kg'
		});
	});
	it('edit keeps current species and unit when fields are missing', () => {
		expect(parseCompanionSpeciesAndUnit(fd({}), { species: 'cat', weightUnit: 'lbs' })).toEqual({
			ok: true,
			species: 'cat',
			weightUnit: 'lbs'
		});
	});
	it('edit accepts a new species and unit', () => {
		expect(
			parseCompanionSpeciesAndUnit(fd({ species: 'other', weightUnit: 'oz' }), {
				species: 'dog',
				weightUnit: 'lbs'
			})
		).toEqual({ ok: true, species: 'other', weightUnit: 'oz' });
	});
});
