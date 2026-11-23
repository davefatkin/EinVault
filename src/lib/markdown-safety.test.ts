import { describe, expect, it } from 'vitest';
import {
	ALLOWED_TAGS,
	allowedHref,
	checkStructure,
	decodeText,
	escapeAttr,
	escapeText,
	linkHref
} from './markdown-safety.js';

describe('escaping', () => {
	it('escapes the text set', () => {
		expect(escapeText('a & b < c > d\u00a0e "q"')).toBe('a &amp; b &lt; c &gt; d&nbsp;e "q"');
	});
	it('escapes the attribute set', () => {
		expect(escapeAttr('a&"<>\u00a0')).toBe('a&amp;&quot;&lt;&gt;&nbsp;');
	});
	it('decodes text and removes NUL', () => {
		expect(decodeText('&notit; &amp; &#x80; a\u0000b')).toBe('¬it; & € ab');
	});
});

describe('allowedHref', () => {
	it.each([
		['https://a', 'https://a'],
		[' http://a ', 'http://a'],
		['', ''],
		['/rel', '/rel'],
		['mailto:x@y', 'mailto:x@y'],
		['tel:1', 'tel:1']
	])('allows %j', (input, out) => {
		expect(allowedHref(input)).toBe(out);
	});
	it.each([
		'javascript:alert(1)',
		'java\tscript:x',
		'JaVaScRiPt:x',
		'data:text/html,x',
		'http://a/-->',
		'http://a/]>',
		'http://a/</script',
		'http://a/--!>',
		'http://a/</SCRIPT'
	])('blocks %j', (input) => {
		expect(allowedHref(input)).toBeNull();
	});
});

describe('linkHref', () => {
	it('blocks entity-obfuscated schemes', () => {
		expect(linkHref('&#106;avascript:alert(1)', false)).toEqual({ status: 'blocked' });
	});
	it('keeps ordinary urls', () => {
		expect(linkHref('https://x.test/?a=1&b=2', false)).toEqual({
			status: 'ok',
			value: 'https://x.test/?a=1&b=2'
		});
	});
	it('reports urls marked cannot clean', () => {
		expect(linkHref('\ud800', false)).toEqual({ status: 'invalid' });
	});
});

describe('checkStructure', () => {
	it.each([
		'<p>a &amp; b <a href="https://x.test/?a=1&amp;b=2">x</a></p>\n',
		'<ul>\n<li>x</li>\n</ul>\n',
		'<p><a>x</a></p>',
		'<p><a href="">x</a></p>',
		'<a href="http://a/?q=&quot;x&quot;&amp;b=&nbsp;c">y</a>'
	])('accepts %j', (html) => {
		expect(checkStructure(html)).toBe(true);
	});
	it.each([
		'<P>x</P>',
		'<p><!-- x --></p>',
		'<p><?x?></p>',
		'<p><a href="a>b">x</a></p>',
		'<p><a href="javascript:alert(1)">x</a></p>',
		'<p><a href="&#106;avascript:x">x</a></p>',
		'<p>a &copy; b</p>',
		'<p><b>x</b></p>',
		'<a title="t">x</a>',
		'<p>x<br/></p>',
		'<a href="x" >y</a>',
		'<a href=" http://a">y</a>',
		'<a href="&nbsp;http://a">y</a>',
		// allowedHref trims the trailing NBSP, so the value is not stable and is rejected.
		'<a href="http://a/?q=&quot;x&quot;&amp;b=&nbsp;">y</a>'
	])('rejects %j', (html) => {
		expect(checkStructure(html)).toBe(false);
	});
	it('stays fast on large hostile input', () => {
		const big = '<a href="' + 'a'.repeat(100_000);
		const start = Date.now();
		expect(checkStructure(big)).toBe(false);
		expect(checkStructure('<p>' + '&amp;'.repeat(20_000) + '</p>')).toBe(true);
		expect(Date.now() - start).toBeLessThan(5000);
	});
});

describe('ALLOWED_TAGS', () => {
	it('lists the allowlist in order', () => {
		expect(ALLOWED_TAGS.join(' ')).toBe(
			'p br strong em del s code pre blockquote ul ol li h1 h2 h3 h4 h5 h6 hr a'
		);
	});
});
