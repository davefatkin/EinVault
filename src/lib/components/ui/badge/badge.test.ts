import { describe, it, expect } from 'vitest';
import { badgeVariants } from './index';

describe('badgeVariants', () => {
	it('adds Companion status intents', () => {
		for (const v of ['teal', 'gold', 'coral'] as const) {
			expect(typeof badgeVariants({ variant: v })).toBe('string');
		}
	});
	it('exposes a soft primary variant for role badges', () => {
		expect(badgeVariants({ variant: 'primary' })).toContain('text-primary');
		expect(badgeVariants({ variant: 'primary' })).toContain('bg-primary/15');
	});
});
