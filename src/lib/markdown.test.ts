import { describe, it, expect } from 'vitest';
import { renderMarkdown, stripMarkdown } from './markdown';

describe('renderMarkdown', () => {
	it('renders basic markdown', () => {
		const html = renderMarkdown('**bold** and *em* and `code`');
		expect(html).toContain('<strong>bold</strong>');
		expect(html).toContain('<em>em</em>');
		expect(html).toContain('<code>code</code>');
	});

	it('strips raw HTML blocks entirely', () => {
		const html = renderMarkdown('before\n\n<script>alert(1)</script>\n\nafter');
		expect(html).not.toContain('<script');
		expect(html).not.toContain('alert(1)');
	});

	it('neutralizes javascript: links', () => {
		const html = renderMarkdown('[click](javascript:alert(1))');
		expect(html.toLowerCase()).not.toContain('javascript:');
		const mixed = renderMarkdown('[click](JaVaScRiPt:alert(1))');
		expect(mixed.toLowerCase()).not.toContain('javascript:');
	});

	it('keeps safe links but only href/rel attributes', () => {
		const html = renderMarkdown('[ok](https://example.com "tip")');
		expect(html).toContain('href="https://example.com"');
		// title comes from markdown but is not in ALLOWED_ATTR; a config
		// regression would let it through.
		expect(html).not.toContain('title=');
	});

	it('strips event handlers and disallowed tags injected via inline HTML', () => {
		const html = renderMarkdown('<img src=x onerror=alert(1)> and <iframe src="x"></iframe>');
		expect(html).not.toContain('<img');
		expect(html).not.toContain('onerror');
		expect(html).not.toContain('<iframe');
	});

	it('blocks data attributes', () => {
		const html = renderMarkdown('<p data-evil="1">x</p>');
		expect(html).not.toContain('data-evil');
	});
});

describe('stripMarkdown', () => {
	it('removes markdown syntax characters and trims', () => {
		expect(stripMarkdown('# Head **bold** `code` [link](x)')).toBe('Head bold code link(x)');
		expect(stripMarkdown('  > quoted  ')).toBe('quoted');
	});
});
