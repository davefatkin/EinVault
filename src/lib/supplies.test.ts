import { describe, it, expect } from 'vitest';
import {
	dailyUse,
	MAX_PROJECTION_DAYS,
	projectRunOut,
	shortestEligibleLead,
	isLowStock,
	supplyAttention,
	formatRunOut,
	supplyStockLine
} from './supplies';

describe('dailyUse', () => {
	it('sums doseUnits per period', () => {
		expect(
			dailyUse([
				{ doseUnits: 1, unit: 'day', interval: 1 },
				{ doseUnits: 1, unit: 'day', interval: 1 },
				{ doseUnits: 7, unit: 'week', interval: 1 }
			])
		).toBe(3);
		expect(dailyUse([])).toBe(0);
	});
});

describe('projectRunOut', () => {
	const counted = (quantity: number | null) => ({
		kind: 'counted' as const,
		quantity,
		lastsDays: null,
		stockedOn: null
	});
	it('counted: floors quantity / dailyUse', () => {
		expect(projectRunOut(counted(10), 3, '2026-11-09')).toEqual({
			runOutOn: '2026-11-12',
			daysLeft: 3
		});
		expect(projectRunOut(counted(0), 3, '2026-11-09')?.daysLeft).toBe(0);
		expect(projectRunOut(counted(10), 0, '2026-11-09')).toBeNull();
		expect(projectRunOut(counted(null), 1, '2026-11-09')).toBeNull();
	});
	it('duration: stockedOn + lastsDays, never negative', () => {
		const d = { kind: 'duration' as const, quantity: null, lastsDays: 30, stockedOn: '2026-11-01' };
		expect(projectRunOut(d, 0, '2026-11-09')).toEqual({ runOutOn: '2026-12-01', daysLeft: 22 });
		expect(projectRunOut(d, 0, '2027-01-15')?.daysLeft).toBe(0);
		expect(projectRunOut({ ...d, stockedOn: null }, 0, '2026-11-09')).toBeNull();
	});
	it('caps a far-off run-out at MAX_PROJECTION_DAYS instead of throwing', () => {
		const capped = { runOutOn: '2036-11-06', daysLeft: MAX_PROJECTION_DAYS };
		expect(MAX_PROJECTION_DAYS).toBe(3650);
		// 3,000,000 at 1 a day, and 300 at 0.0001 a day, are both millennia away.
		expect(projectRunOut(counted(3_000_000), 1, '2026-11-09')).toEqual(capped);
		expect(
			projectRunOut(
				counted(300),
				dailyUse([{ doseUnits: 0.0001, unit: 'day', interval: 1 }]),
				'2026-11-09'
			)
		).toEqual(capped);
		expect(projectRunOut(counted(1e300), 1e-300, '2026-11-09')).toEqual(capped);
	});
});

describe('shortestEligibleLead', () => {
	it('picks the smallest lead covering daysUntil', () => {
		expect(shortestEligibleLead([14, 7], 10)).toBe(14);
		expect(shortestEligibleLead([14, 7], 6)).toBe(7);
		expect(shortestEligibleLead([14, 7], 20)).toBeNull();
		expect(shortestEligibleLead([], 0)).toBeNull();
	});
});

describe('isLowStock', () => {
	it('compares at or below the threshold', () => {
		expect(isLowStock(3, 3)).toBe(true);
		expect(isLowStock(4, 3)).toBe(false);
		expect(isLowStock(null, 3)).toBe(false);
		expect(isLowStock(3, null)).toBe(false);
	});
});

describe('supplyAttention', () => {
	const base = {
		kind: 'counted' as const,
		quantity: 20,
		lowStockAt: null,
		expiresOn: null,
		daysLeft: null as number | null
	};
	const today = '2026-11-09';
	it('flags run-out leads, low stock and out', () => {
		expect(supplyAttention({ ...base, daysLeft: 5 }, [7], [], today).runningLow).toBe(true);
		expect(supplyAttention({ ...base, daysLeft: 30 }, [7], [], today).runningLow).toBe(false);
		expect(supplyAttention({ ...base, daysLeft: 30 }, [], [], today).runningLow).toBe(false);
		expect(supplyAttention({ ...base, daysLeft: 0 }, [], [], today).runningLow).toBe(true);
		expect(supplyAttention({ ...base, quantity: 2, lowStockAt: 5 }, [], [], today).runningLow).toBe(
			true
		);
	});
	it('flags an empty counted supply with no schedule and no low-stock count', () => {
		expect(supplyAttention({ ...base, quantity: 0 }, [], [], today).runningLow).toBe(true);
		expect(supplyAttention({ ...base, quantity: 0.5 }, [], [], today).runningLow).toBe(false);
		const duration = { ...base, kind: 'duration' as const, quantity: null };
		expect(supplyAttention(duration, [], [], today).runningLow).toBe(false);
	});
	it('flags expiry within a lead, but not for an empty counted supply', () => {
		const exp = { ...base, expiresOn: '2026-11-20' };
		expect(supplyAttention(exp, [], [14], today).expiring).toBe(true);
		expect(supplyAttention(exp, [], [7], today).expiring).toBe(false);
		expect(supplyAttention({ ...exp, quantity: 0 }, [], [14], today).expiring).toBe(false);
		expect(
			supplyAttention({ ...exp, kind: 'duration', quantity: null }, [], [14], today).expiring
		).toBe(true);
	});
	it('says expired, not expiring, once the date has passed', () => {
		const at = (expiresOn: string) => supplyAttention({ ...base, expiresOn }, [], [14], today);
		expect(at('2026-11-08')).toMatchObject({ expiring: true, expired: true });
		expect(at('2026-11-09')).toMatchObject({ expiring: true, expired: false });
		expect(at('2026-11-20')).toMatchObject({ expiring: true, expired: false });
		// An empty counted supply is out, not expired.
		expect(
			supplyAttention({ ...base, quantity: 0, expiresOn: '2026-11-08' }, [], [14], today)
		).toMatchObject({ expiring: false, expired: false });
	});
});

describe('formatRunOut', () => {
	it('uses days below 14, weeks from 14, Out at 0', () => {
		expect(formatRunOut('en', 0)).toBe('Out');
		expect(formatRunOut('en', 1)).toBe('about 1 day left');
		expect(formatRunOut('en', 13)).toBe('about 13 days left');
		expect(formatRunOut('en', 14)).toBe('about 2 weeks left');
		expect(formatRunOut('en', 20)).toBe('about 2 weeks left');
		expect(formatRunOut('de', 5)).toContain('5');
	});
});

describe('supplyStockLine', () => {
	const counted = { kind: 'counted' as const, unit: 'tablets', quantity: 42, daysLeft: null };
	it('counts, then adds a short run-out after a count', () => {
		expect(supplyStockLine('en', counted)).toBe('42 tablets left');
		expect(supplyStockLine('en', { ...counted, daysLeft: 21 })).toBe(
			'42 tablets left · about 3 weeks'
		);
		expect(supplyStockLine('en', { ...counted, quantity: 0.5, unit: null, daysLeft: 0 })).toBe(
			'0.5 left · runs out today'
		);
		expect(supplyStockLine('en', { ...counted, quantity: 0, daysLeft: 0 })).toBe('0 tablets left');
	});
	it('gives a duration supply its run-out line, or says it was never bought', () => {
		const duration = { kind: 'duration' as const, unit: null, quantity: null };
		expect(supplyStockLine('en', { ...duration, daysLeft: 12 })).toBe('about 12 days left');
		expect(supplyStockLine('en', { ...duration, daysLeft: null })).toBe('Not bought yet');
	});
});
