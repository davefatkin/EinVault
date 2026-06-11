import { describe, it, expect } from 'vitest';
import { badgeVariants } from './index';

describe('badgeVariants', () => {
	it('adds Companion status intents', () => {
		for (const v of ['teal', 'gold', 'coral'] as const) {
			expect(typeof badgeVariants({ variant: v })).toBe('string');
		}
	});
	it('keeps legacy bark/moss/sky intents (still used by un-redesigned pages)', () => {
		for (const v of ['bark', 'moss', 'sky'] as const) {
			expect(typeof badgeVariants({ variant: v })).toBe('string');
		}
	});
});
