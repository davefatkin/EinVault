import { describe, it, expect } from 'vitest';
import { parseCompanionDates, parseCompanionSpeciesAndUnit } from './companion-form';

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

describe('parseCompanionDates', () => {
	const today = '2026-11-03';
	it('empty dob forces approximate off', () => {
		expect(parseCompanionDates(fd({ dob: '', dobApproximate: 'on' }), today)).toEqual({
			ok: true,
			dob: null,
			dobApproximate: false,
			homecomingDate: null
		});
	});
	it('keeps approximate with a dob', () => {
		expect(
			parseCompanionDates(fd({ dob: '2020-01-02', dobApproximate: 'on' }), today)
		).toMatchObject({ ok: true, dob: '2020-01-02', dobApproximate: true });
	});
	it('rejects a future or impossible dob', () => {
		expect(parseCompanionDates(fd({ dob: '2026-11-04' }), today)).toEqual({
			ok: false,
			error: 'invalidDob'
		});
		expect(parseCompanionDates(fd({ dob: '2025-02-29' }), today)).toEqual({
			ok: false,
			error: 'invalidDob'
		});
	});
	it('rejects a future homecoming date', () => {
		expect(parseCompanionDates(fd({ homecomingDate: '2027-01-01' }), today)).toEqual({
			ok: false,
			error: 'invalidHomecoming'
		});
	});
	it('accepts today and homecoming before dob', () => {
		expect(parseCompanionDates(fd({ dob: '2026-11-03' }), today)).toMatchObject({ ok: true });
		expect(
			parseCompanionDates(fd({ dob: '2020-01-01', homecomingDate: '2019-01-01' }), today)
		).toMatchObject({ ok: true, homecomingDate: '2019-01-01' });
	});
});
