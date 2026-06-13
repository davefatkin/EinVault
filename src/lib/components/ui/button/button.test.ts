import { describe, it, expect } from 'vitest';
import { buttonVariants } from './index';

describe('buttonVariants', () => {
	it('keeps the documented variants and sizes', () => {
		for (const v of ['default', 'destructive', 'outline', 'secondary', 'ghost', 'link'] as const) {
			expect(typeof buttonVariants({ variant: v })).toBe('string');
		}
		for (const s of ['default', 'sm', 'lg', 'icon'] as const) {
			expect(typeof buttonVariants({ size: s })).toBe('string');
		}
	});
	it('default variant uses the brand gradient', () => {
		expect(buttonVariants({ variant: 'default' })).toContain('bg-brand-gradient');
	});
});
