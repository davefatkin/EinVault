import { describe, it, expect, vi } from 'vitest';
import { Parser, Renderer } from 'marked';
import { markdownRenderer, renderMarkdown } from './markdown';

describe('renderMarkdown', () => {
	it('renders basic markdown', () => {
		const html = renderMarkdown('**bold** and *em* and `code`');
		expect(html).toContain('<strong>bold</strong>');
		expect(html).toContain('<em>em</em>');
		expect(html).toContain('<code>code</code>');
	});

	it('turns a single newline into a line break', () => {
		const html = renderMarkdown('line one\nline two');
		expect(html).toContain('<br');
		expect(html).toContain('line one');
		expect(html).toContain('line two');
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

describe('renderMarkdown allowlist renderer', () => {
	it('drops a tag marked tokenizes as HTML after a raw-block opener', () => {
		const html = renderMarkdown('a <kbd> <IMG SRC=x ONERROR=alert(1)>');
		expect(html).not.toContain('<IMG');
		expect(html).not.toContain('<kbd');
	});

	it('shows raw-block text as visible escaped text', () => {
		// marked keeps the text after <kbd> raw; <svg/onload> is not an HTML
		// token to marked, so it stays in that raw text.
		const html = renderMarkdown('a <kbd> <svg/onload=alert(1)>');
		expect(html).toContain('&lt;svg/onload=alert(1)&gt;');
		expect(html).not.toContain('<svg');
	});

	it('drops an entity-encoded javascript: href', () => {
		expect(renderMarkdown('[x](&#106;avascript:alert(1))')).toBe('<p><a>x</a></p>\n');
	});

	it('flattens a link nested inside a link', () => {
		expect(renderMarkdown('[*a <http://c> b*](http://b)')).toBe(
			'<p><a href="http://b"><em>a http://c b</em></a></p>\n'
		);
	});

	it('overrides every marked renderer method without returning false', () => {
		const names = Object.getOwnPropertyNames(Renderer.prototype).filter((n) => n !== 'constructor');
		expect(names.length).toBeGreaterThan(20);
		const renderer = new Renderer();
		new Parser({ renderer });
		const token = {
			type: 'text',
			raw: '',
			text: '',
			href: '',
			title: null,
			depth: 1,
			tokens: [],
			items: [],
			header: [],
			rows: [],
			align: [],
			checked: false
		};
		const own = markdownRenderer as Record<string, unknown>;
		for (const name of names) {
			expect(Object.hasOwn(own, name), name).toBe(true);
			const fn = own[name] as (t: unknown) => unknown;
			expect(fn.call(renderer, token), name).not.toBe(false);
		}
	});

	it('keeps links after harmless raw-block text', () => {
		expect(renderMarkdown('<kbd>Ctrl</kbd>+C, see [docs](http://a.test)')).toBe(
			'<p>Ctrl+C, see <a href="http://a.test">docs</a></p>\n'
		);
	});

	it('renders links after raw-block text containing < as text only', () => {
		expect(renderMarkdown('<code>a<b</code> [x](http://a.test)')).toBe('<p>a&lt;b x</p>\n');
	});

	it('normalizes a CR from a numeric reference to LF, as the HTML parser did', () => {
		expect(renderMarkdown('a &#13;&#10; b')).toBe('<p>a \n b</p>\n');
	});

	it('falls back to escaped source text and logs once when the output fails the check', async () => {
		vi.resetModules();
		vi.doMock('./markdown-safety.js', async (importOriginal) => ({
			...(await importOriginal<typeof import('./markdown-safety.js')>()),
			checkStructure: () => false
		}));
		const error = vi.spyOn(console, 'error').mockImplementation(() => {});
		try {
			const mod = await import('./markdown.js');
			expect(() => mod.renderMarkdownOrThrow('x')).toThrow();
			expect(mod.renderMarkdown('a <b> & c')).toBe('<p>a &lt;b&gt; &amp; c</p>');
			expect(mod.renderMarkdown('y')).toBe('<p>y</p>');
			expect(error).toHaveBeenCalledTimes(1);
		} finally {
			error.mockRestore();
			vi.doUnmock('./markdown-safety.js');
			vi.resetModules();
		}
	});

	it('renders 100 KB of mixed markdown in under a second', () => {
		const para =
			'# Heading\n\nSome **bold** and *em* text with [a link](https://example.com) and `code` &amp; &copy;.\n\n- item one\n- item two\n\n```\nblock\n```\n\n';
		const text = para.repeat(Math.ceil(100_000 / para.length));
		const start = performance.now();
		renderMarkdown(text);
		expect(performance.now() - start).toBeLessThan(1000);
	});
});
