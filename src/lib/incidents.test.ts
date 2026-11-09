import { describe, it, expect } from 'vitest';
import { localDateISO } from '#lib/date.js';
import {
	currentSeverity,
	incidentDayNumber,
	parseSeverity,
	incidentPath,
	careIncidentPath,
	ownerIncidentCaps,
	caretakerIncidentCaps,
	type UpdateView
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

const upd = (loggedBy: string | null, createdAt: Date) => ({ loggedBy, createdAt }) as UpdateView;

describe('ownerIncidentCaps', () => {
	it('allows everything on an active open incident', () => {
		const c = ownerIncidentCaps({ active: true, resolved: false });
		expect(c).toMatchObject({
			canEditOverview: true,
			canAddUpdate: true,
			canResolve: true,
			canLink: true,
			canAttachDocuments: true,
			canDelete: true
		});
		expect(c.canEditUpdate(upd('x', new Date('2020-01-01')))).toBe(true);
	});
	it('blocks new updates on a resolved incident but keeps the rest', () => {
		const c = ownerIncidentCaps({ active: true, resolved: true });
		expect(c.canAddUpdate).toBe(false);
		expect(c.canResolve).toBe(true);
		expect(c.canEditUpdate(upd(null, new Date()))).toBe(true);
	});
	it('is read-only for an archived companion', () => {
		const c = ownerIncidentCaps({ active: false, resolved: false });
		expect(c.canEditOverview || c.canAddUpdate || c.canResolve || c.canLink).toBe(false);
		expect(c.canAttachDocuments || c.canDelete).toBe(false);
		expect(c.canEditUpdate(upd('x', new Date()))).toBe(false);
	});
});

describe('caretakerIncidentCaps', () => {
	const now = new Date();
	const yesterday = new Date(now.getTime() - 36 * 3_600_000);
	it('offers only adding updates, and only on shift', () => {
		for (const isOnShift of [true, false]) {
			const c = caretakerIncidentCaps({ isOnShift, userId: 'me' });
			expect(c.canAddUpdate).toBe(isOnShift);
			expect(c.canEditOverview || c.canResolve || c.canLink).toBe(false);
			expect(c.canAttachDocuments || c.canDelete).toBe(false);
		}
	});
	it('lets an on-shift caretaker edit their own update from today', () => {
		const c = caretakerIncidentCaps({ isOnShift: true, userId: 'me' });
		expect(c.canEditUpdate(upd('me', now))).toBe(true);
	});
	it("refuses someone else's update, and own updates from earlier days", () => {
		const c = caretakerIncidentCaps({ isOnShift: true, userId: 'me' });
		expect(c.canEditUpdate(upd('other', now))).toBe(false);
		expect(c.canEditUpdate(upd(null, now))).toBe(false);
		expect(c.canEditUpdate(upd('me', yesterday))).toBe(false);
	});
	it('refuses all edits off shift', () => {
		const c = caretakerIncidentCaps({ isOnShift: false, userId: 'me' });
		expect(c.canEditUpdate(upd('me', now))).toBe(false);
	});
	it('takes today as a parameter', () => {
		const c = caretakerIncidentCaps({
			isOnShift: true,
			userId: 'me',
			today: localDateISO(yesterday)
		});
		expect(c.canEditUpdate(upd('me', yesterday))).toBe(true);
		expect(c.canEditUpdate(upd('me', now))).toBe(false);
	});
});
