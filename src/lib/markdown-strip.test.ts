import { describe, it, expect } from 'vitest';
import { stripMarkdown } from './markdown-strip';

describe('stripMarkdown', () => {
	it('removes markdown syntax characters and trims', () => {
		expect(stripMarkdown('# Head **bold** `code` [link](x)')).toBe('Head bold code link(x)');
		expect(stripMarkdown('  > quoted  ')).toBe('quoted');
	});
});
