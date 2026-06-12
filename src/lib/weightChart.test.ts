import { describe, it, expect } from 'vitest';
import { filterByRange, buildAreaPath, percentChange, type WeightPoint } from './weightChart';

const P = (recordedAt: string, weight: number, unit: 'lbs' | 'kg' = 'lbs'): WeightPoint => ({
	recordedAt: new Date(recordedAt),
	weight,
	unit
});

describe('filterByRange', () => {
	const pts = [
		P('2025-11-01', 29), // > 6 months before 2026-06-12 (cutoff 2025-12-12) -> excluded by 6m
		P('2026-01-01', 30),
		P('2026-03-01', 31),
		P('2026-05-01', 32),
		P('2026-06-01', 33)
	];
	const now = new Date('2026-06-12');
	it('returns all for "all"', () => {
		expect(filterByRange(pts, 'all', now)).toHaveLength(5);
	});
	it('6m keeps points within 6 months of now (excludes the Nov 2025 point)', () => {
		const out = filterByRange(pts, '6m', now);
		expect(out.map((p) => p.weight)).toEqual([30, 31, 32, 33]);
	});
	it('1y keeps all here', () => {
		expect(filterByRange(pts, '1y', now)).toHaveLength(5);
	});
	it('keeps input order (assumed ascending by date)', () => {
		const out = filterByRange(pts, 'all', now);
		expect(out.map((p) => p.weight)).toEqual([29, 30, 31, 32, 33]);
	});
});

describe('percentChange', () => {
	it('computes change from first to last', () => {
		expect(percentChange([P('2026-01-01', 30), P('2026-06-01', 33)])).toBeCloseTo(10, 5);
	});
	it('is negative when weight dropped', () => {
		expect(percentChange([P('a', 40), P('b', 30)])).toBeCloseTo(-25, 5);
	});
	it('returns null for fewer than 2 points', () => {
		expect(percentChange([P('a', 30)])).toBeNull();
		expect(percentChange([])).toBeNull();
	});
	it('returns null when the first weight is 0 (avoid div-by-zero)', () => {
		expect(percentChange([P('a', 0), P('b', 5)])).toBeNull();
	});
});

describe('buildAreaPath', () => {
	it('returns empty string for fewer than 2 points', () => {
		expect(buildAreaPath([30], 100, 40)).toBe('');
		expect(buildAreaPath([], 100, 40)).toBe('');
	});
	it('builds a closed area path that starts at the baseline and returns to it', () => {
		const d = buildAreaPath([30, 31, 32], 100, 40);
		expect(d.startsWith('M')).toBe(true);
		expect(d.endsWith('Z')).toBe(true);
		expect(d).toContain('L100.00,40.00');
		expect(d).toContain('L0.00,40.00');
	});
});
