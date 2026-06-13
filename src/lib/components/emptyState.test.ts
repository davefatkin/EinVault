import { describe, it, expect } from 'vitest';
import { emptyStateCircleClass } from './emptyState';

describe('emptyStateCircleClass', () => {
	it('maps each tint to its Companion token classes', () => {
		expect(emptyStateCircleClass('primary')).toBe('bg-primary/10 text-primary');
		expect(emptyStateCircleClass('teal')).toBe('bg-teal/10 text-teal');
		expect(emptyStateCircleClass('gold')).toBe('bg-gold/10 text-gold');
		expect(emptyStateCircleClass('coral')).toBe('bg-coral/10 text-coral');
		expect(emptyStateCircleClass('muted')).toBe('bg-muted text-muted-foreground');
	});
});
