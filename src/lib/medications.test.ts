import { describe, it, expect } from 'vitest';
import { isMedicationActive } from '#lib/medications.js';

describe('isMedicationActive', () => {
	it('is active without an end date', () => {
		expect(isMedicationActive(null, '2026-11-09')).toBe(true);
	});
	it('is active on the end date itself (inclusive)', () => {
		expect(isMedicationActive('2026-11-09', '2026-11-09')).toBe(true);
	});
	it('is active before the end date', () => {
		expect(isMedicationActive('2026-11-10', '2026-11-09')).toBe(true);
	});
	it('is ended after the end date', () => {
		expect(isMedicationActive('2026-11-08', '2026-11-09')).toBe(false);
	});
});
