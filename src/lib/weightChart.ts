import type { WeightUnit } from '$lib/activityTypes';

export interface WeightPoint {
	recordedAt: Date;
	weight: number;
	unit: WeightUnit;
}

export type WeightRange = '6m' | '1y' | 'all';

const GRAMS_PER: Record<WeightUnit, number> = {
	g: 1,
	kg: 1000,
	oz: 28.349523125,
	lbs: 453.59237
};

/** Convert a weight between any two supported units (via grams). */
export function convertWeight(weight: number, from: WeightUnit, to: WeightUnit): number {
	if (from === to) return weight;
	return (weight * GRAMS_PER[from]) / GRAMS_PER[to];
}

/** Keep points within the range, relative to `now`. Assumes input is sorted ascending by recordedAt. */
export function filterByRange(points: WeightPoint[], range: WeightRange, now: Date): WeightPoint[] {
	if (range === 'all') return points;
	const cutoff = new Date(now);
	if (range === '6m') cutoff.setMonth(cutoff.getMonth() - 6);
	else cutoff.setFullYear(cutoff.getFullYear() - 1);
	return points.filter((p) => p.recordedAt >= cutoff);
}

/** Percent change from the first to the last point; null for <2 points or a zero baseline. */
export function percentChange(points: WeightPoint[]): number | null {
	if (points.length < 2) return null;
	const first = points[0].weight;
	const last = points[points.length - 1].weight;
	if (first === 0) return null;
	return ((last - first) / first) * 100;
}

function scalePoints(values: number[], width: number, height: number): { x: number; y: number }[] {
	const min = Math.min(...values);
	const max = Math.max(...values);
	const range = max - min || 1;
	const pad = 2;
	return values.map((v, i) => ({
		x: (i / (values.length - 1)) * width,
		y: pad + (1 - (v - min) / range) * (height - pad * 2)
	}));
}

/**
 * Closed SVG area path for the values, scaled to width × height. Empty for <2
 * points. The line follows the values; the path then closes down to the bottom
 * edge and back to x=0 so it can be filled.
 */
export function buildAreaPath(values: number[], width: number, height: number): string {
	if (values.length < 2) return '';
	const pts = scalePoints(values, width, height);
	const line = pts.map((p) => `${p.x.toFixed(2)},${p.y.toFixed(2)}`).join('L');
	const lastX = pts[pts.length - 1].x.toFixed(2);
	return `M${line}L${lastX},${height.toFixed(2)}L${(0).toFixed(2)},${height.toFixed(2)}Z`;
}

/** Line-only path (reuse for the stroke on top of the area). Empty for <2 points. */
export function buildLinePath(values: number[], width: number, height: number): string {
	if (values.length < 2) return '';
	const pts = scalePoints(values, width, height);
	return 'M' + pts.map((p) => `${p.x.toFixed(2)},${p.y.toFixed(2)}`).join('L');
}
