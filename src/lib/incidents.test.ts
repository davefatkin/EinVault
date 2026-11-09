import { describe, it, expect } from 'vitest';
import {
	currentSeverity,
	incidentDayNumber,
	parseSeverity,
	incidentPath,
	careIncidentPath
} from './incidents.js';

const d = (s: string) => new Date(s);

describe('currentSeverity', () => {
	it('uses the latest update with a severity, ignoring nulls', () => {
		expect(
			currentSeverity({ severity: 'mild' }, [
				{ severity: 'severe', occurredAt: d('2026-05-02T10:00:00') },
				{ severity: 'moderate', occurredAt: d('2026-05-03T10:00:00') },
				{ severity: null, occurredAt: d('2026-05-04T10:00:00') }
			])
		).toBe('moderate');
	});
	it('falls back to the incident, then null', () => {
		expect(
			currentSeverity({ severity: 'mild' }, [{ severity: null, occurredAt: d('2026-05-02') }])
		).toBe('mild');
		expect(currentSeverity({ severity: null }, [])).toBeNull();
	});
});

describe('incidentDayNumber', () => {
	it('is 1 on the start day and counts local days', () => {
		const start = new Date(2026, 4, 1, 23, 30);
		expect(incidentDayNumber(start, new Date(2026, 4, 1, 23, 59))).toBe(1);
		expect(incidentDayNumber(start, new Date(2026, 4, 2, 0, 5))).toBe(2);
		expect(incidentDayNumber(start, new Date(2026, 4, 4, 8, 0))).toBe(4);
	});
});

describe('parseSeverity and paths', () => {
	it('parses', () => {
		expect(parseSeverity('severe')).toBe('severe');
		expect(parseSeverity('bad')).toBeNull();
		expect(parseSeverity(undefined)).toBeNull();
	});
	it('builds paths', () => {
		expect(incidentPath('c', 'i')).toBe('/c/health/incidents/i');
		expect(careIncidentPath('c', 'i')).toBe('/care/c/incidents/i');
	});
});
