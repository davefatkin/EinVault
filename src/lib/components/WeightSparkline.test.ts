import { describe, it, expect } from 'vitest';
import { buildSparklinePath } from './weightSparkline.js';

describe('buildSparklinePath', () => {
	it('produces a path with one point per value', () => {
		const d = buildSparklinePath([1, 2, 3], 100, 30);
		expect(d).toMatch(/^M/);
		expect(d.split(/[ML]/).filter(Boolean).length).toBe(3);
	});

	it('returns empty for <2 points', () => {
		expect(buildSparklinePath([5], 100, 30)).toBe('');
		expect(buildSparklinePath([], 100, 30)).toBe('');
	});

	it('starts at x=0 and ends at x=width', () => {
		const d = buildSparklinePath([10, 20], 100, 30);
		expect(d).toMatch(/^M0\.00/);
		expect(d).toContain('L100.00');
	});

	it('handles flat series (all same value) without crash', () => {
		const d = buildSparklinePath([5, 5, 5], 100, 30);
		expect(d).toMatch(/^M/);
		// y values should all be equal (midpoint)
		const parts = d.split(/[ML]/).filter(Boolean);
		const ys = parts.map((p) => parseFloat(p.split(',')[1]));
		expect(new Set(ys).size).toBe(1);
	});
});
