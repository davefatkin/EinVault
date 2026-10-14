import { describe, it, expect } from 'vitest';
import { parseHealthEventForm } from './health';
import { parseWeightForm } from './weight';
import { parseFormTimestamp } from './validation';

const form = (entries: Record<string, string>) => {
	const fd = new FormData();
	for (const [k, v] of Object.entries(entries)) fd.set(k, v);
	return fd;
};

describe('parseFormTimestamp', () => {
	it('treats a missing or blank value as now', () => {
		const before = Date.now();
		expect(parseFormTimestamp(null)!.getTime()).toBeGreaterThanOrEqual(before);
		expect(parseFormTimestamp('  ')!.getTime()).toBeGreaterThanOrEqual(before);
	});
	it('rejects a value that does not parse', () => {
		expect(parseFormTimestamp('not-a-date')).toBeNull();
	});
	it('accepts a future timestamp', () => {
		const future = new Date(Date.now() + 30 * 86_400_000).toISOString();
		expect(parseFormTimestamp(future)!.toISOString()).toBe(future);
	});
});

describe('parseHealthEventForm', () => {
	const ok = { title: ' Checkup ', type: 'vet_visit', occurredAt: '2026-01-05T12:00:00.000Z' };

	it('parses and trims a valid event', () => {
		const r = parseHealthEventForm(
			form({ ...ok, notes: ' n ', vetName: '', vetClinic: ' Clinic ' }),
			'en'
		);
		expect(r).toEqual({
			ok: true,
			value: {
				type: 'vet_visit',
				title: 'Checkup',
				notes: 'n',
				occurredAt: new Date('2026-01-05T12:00:00.000Z'),
				vetName: null,
				vetClinic: 'Clinic'
			}
		});
	});
	it('requires a title and a valid type', () => {
		expect(parseHealthEventForm(form({ ...ok, title: ' ' }), 'en')).toEqual({
			ok: false,
			message: 'Title and a valid type are required.'
		});
		expect(parseHealthEventForm(form({ ...ok, type: 'bogus' }), 'en')).toMatchObject({
			ok: false
		});
	});
	it('rejects a bad timestamp with invalidDateTime', () => {
		expect(parseHealthEventForm(form({ ...ok, occurredAt: 'nope' }), 'en')).toEqual({
			ok: false,
			message: 'Enter a valid date and time.'
		});
	});
	it('accepts a future date', () => {
		const future = new Date(Date.now() + 30 * 86_400_000).toISOString();
		expect(parseHealthEventForm(form({ ...ok, occurredAt: future }), 'en').ok).toBe(true);
	});
	it('caps title, notes, vet name and clinic at 5000 characters', () => {
		for (const field of ['title', 'notes', 'vetName', 'vetClinic']) {
			expect(parseHealthEventForm(form({ ...ok, [field]: 'x'.repeat(5001) }), 'en')).toEqual({
				ok: false,
				message: 'Too long (max 5000 characters).'
			});
		}
	});
});

describe('parseWeightForm', () => {
	const ok = { weight: '12.5', unit: 'kg', recordedAt: '2026-01-05T12:00:00.000Z' };

	it('parses a valid weight', () => {
		expect(parseWeightForm(form(ok), 'lbs', 'en')).toEqual({
			ok: true,
			value: {
				weight: 12.5,
				unit: 'kg',
				notes: null,
				recordedAt: new Date('2026-01-05T12:00:00.000Z')
			}
		});
	});
	it('falls back to the default unit', () => {
		const r = parseWeightForm(form({ ...ok, unit: 'stone' }), 'lbs', 'en');
		expect(r.ok && r.value.unit).toBe('lbs');
	});
	it('rejects a missing, zero, negative or infinite weight', () => {
		for (const weight of ['', '0', '-1', 'abc', 'Infinity']) {
			expect(parseWeightForm(form({ ...ok, weight }), 'lbs', 'en')).toEqual({
				ok: false,
				message: 'Valid weight is required.'
			});
		}
	});
	it('rejects a bad timestamp and overlong notes', () => {
		expect(parseWeightForm(form({ ...ok, recordedAt: 'nope' }), 'lbs', 'en')).toMatchObject({
			ok: false,
			message: 'Enter a valid date and time.'
		});
		expect(parseWeightForm(form({ ...ok, notes: 'x'.repeat(5001) }), 'lbs', 'en')).toMatchObject({
			ok: false,
			message: 'Too long (max 5000 characters).'
		});
	});
});
