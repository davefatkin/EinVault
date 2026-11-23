import { describe, it, expect } from 'vitest';
import { Marked, type Token, type Tokens } from 'marked';
import DOMPurify from 'dompurify';
import { JSDOM } from 'jsdom';
import { renderMarkdownOrThrow } from './markdown.js';
import { MARKDOWN_CORPUS } from './markdown.corpus.js';

// Differential test: renderMarkdownOrThrow against today's pipeline (marked, then
// DOMPurify on jsdom) rebuilt here. jsdom and dompurify are devDependencies
// only; nothing in this file is importable by app code.

const ALLOWED_TAGS = [
	'p',
	'br',
	'strong',
	'em',
	'del',
	's',
	'code',
	'pre',
	'blockquote',
	'ul',
	'ol',
	'li',
	'h1',
	'h2',
	'h3',
	'h4',
	'h5',
	'h6',
	'hr',
	'a'
];

const SANITIZE_CONFIG = {
	ALLOWED_TAGS,
	ALLOWED_ATTR: ['href', 'rel'],
	ALLOW_DATA_ATTR: false,
	FORCE_BODY: false
};

const dom = new JSDOM('');
const purify = DOMPurify(dom.window);

function newMarked(): Marked {
	return new Marked({ gfm: true, breaks: true, async: false });
}

/** Today's pipeline, verbatim from the old markdown.ts. */
function oracle(text: string): string {
	const m = newMarked();
	m.use({
		renderer: {
			html() {
				return '';
			}
		}
	});
	const raw = m.parse(text) as string;
	return purify.sanitize(raw, SANITIZE_CONFIG) as string;
}

function hasLinkDescendant(tokens: Token[] | undefined): boolean {
	if (!tokens) return false;
	for (const t of tokens) {
		if (t.type === 'link') return true;
		const sub = (t as { tokens?: Token[] }).tokens;
		if (hasLinkDescendant(sub)) return true;
	}
	return false;
}

/**
 * Divergence classes from the design spec, decided by marked's own tokens:
 * 'raw-block' when a text token has escaped === true (only those reach an
 * HTML parser unescaped), 'nested-link' when a link has a link descendant.
 */
function classify(text: string): 'raw-block' | 'nested-link' | null {
	const m = newMarked();
	const tokens = m.lexer(text);
	let rawBlock = false;
	let nestedLink = false;
	m.walkTokens(tokens, (t) => {
		if (t.type === 'text' && (t as Tokens.Text).escaped === true) rawBlock = true;
		if (t.type === 'link' && hasLinkDescendant((t as Tokens.Link).tokens)) nestedLink = true;
	});
	if (rawBlock) return 'raw-block';
	if (nestedLink) return 'nested-link';
	return null;
}

function mulberry32(seed: number): () => number {
	let a = seed >>> 0;
	return () => {
		a = (a + 0x6d2b79f5) >>> 0;
		let t = a;
		t = Math.imul(t ^ (t >>> 15), t | 1);
		t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}

const ALPHABET: readonly string[] = [
	// whole entities
	'&amp;',
	'&lt;',
	'&gt;',
	'&quot;',
	'&nbsp;',
	'&nbsp',
	'&amp',
	'&not',
	'&notit;',
	'&notin;',
	'&ampx;',
	'&lt=',
	'&copy;',
	'&bne;',
	'&colon;',
	'&Tab;',
	'&NewLine;',
	'&#106;',
	'&#x6a;',
	'&#58;',
	'&#9;',
	'&#10;',
	'&#32;',
	'&#0;',
	'&#x80;',
	'&#x9F;',
	'&#xD800;',
	'&#x110000;',
	'&',
	// tags
	'</kbd>',
	'<b>',
	'</b>',
	'<IMG SRC=x ONERROR=y>',
	'<a href="x">',
	'</a>',
	'<svg/onload=y>',
	'<!--',
	'-->',
	'<!-- c -->',
	'<?',
	'<',
	'>',
	// scheme fragments
	'javascript:',
	'JaVa',
	'script:',
	'data:',
	'vbscript:',
	'http://',
	'https://',
	'mailto:',
	'www.',
	'a.test',
	'x@y.test',
	'--&gt;',
	'</script',
	// markdown markers
	'*',
	'**',
	'_',
	'__',
	'~~',
	'`',
	'```',
	'[',
	']',
	'](',
	')',
	'(',
	'![',
	'[x](http://c.test)',
	'#',
	'## ',
	'- ',
	'* ',
	'1. ',
	'- [ ] ',
	'> ',
	'|',
	'| a | b |',
	'---',
	'|---|---|',
	'\\',
	// whitespace and separators
	' ',
	' ',
	'  ',
	'\n',
	'\n',
	'\n\n',
	'\r\n',
	'\t',
	' ',
	'\u0000',
	'\u000c',
	// text
	'a',
	'b',
	'x',
	'hello',
	'é',
	'\u{1F600}',
	'ש',
	'\ud800'
];

// Rare tokens: raw-block openers (any case) and link-in-link shapes. They push
// a case out of the identity-compared class, so they are drawn with low
// probability per token to keep most generated cases identity-checked.
const RARE_ALPHABET: readonly string[] = [
	'<kbd>',
	'<code>',
	'<pre>',
	'<script>',
	'<KBD>',
	'<Code>',
	'<PRE>',
	'<ScRiPt>',
	'[<http://c.test>](http://b.test)',
	'[a [x](http://c.test) b](http://b.test)',
	'<http://c.test>'
];
const RARE_PROBABILITY = 0.003;

function generateCases(seed: number, count: number): string[] {
	const rand = mulberry32(seed);
	const out: string[] = [];
	for (let i = 0; i < count; i++) {
		const n = 1 + Math.floor(rand() * 40);
		let s = '';
		for (let j = 0; j < n; j++) {
			const pool = rand() < RARE_PROBABILITY ? RARE_ALPHABET : ALPHABET;
			s += pool[Math.floor(rand() * pool.length)];
		}
		out.push(s);
	}
	return out;
}

function hrefSet(html: string): Set<string> {
	const doc = dom.window.document;
	const holder = doc.createElement('div');
	holder.innerHTML = html;
	const set = new Set<string>();
	for (const a of Array.from(holder.querySelectorAll('a'))) {
		const h = a.getAttribute('href');
		if (h !== null) set.add(h);
	}
	return set;
}

describe('classify', () => {
	it('flags raw-block text', () => {
		expect(classify('a <kbd> <b>x</b>')).toBe('raw-block');
	});
	it('flags nested links', () => {
		expect(classify('[*a <http://c> b*](http://b)')).toBe('nested-link');
	});
	it('returns null for ordinary markdown', () => {
		expect(classify('**plain** [x](http://a)')).toBeNull();
	});
});

/** Compares one input; returns a failure description or null. */
function compareCase(
	index: number,
	input: string,
	render: (text: string) => string
): { failure: string | null; cls: 'raw-block' | 'nested-link' | null } {
	try {
		const cls = classify(input);
		const out = render(input);
		const old = oracle(input);
		if (cls === null) {
			if (out === old) return { failure: null, cls };
			return {
				cls,
				failure: `#${index} ${JSON.stringify(input)}\n  new: ${JSON.stringify(out)}\n  old: ${JSON.stringify(old)}`
			};
		}
		const fixedPoint = purify.sanitize(out, SANITIZE_CONFIG) as string;
		if (fixedPoint !== out) {
			return {
				cls,
				failure: `#${index} [${cls}] not a fixed point ${JSON.stringify(input)}\n  new: ${JSON.stringify(out)}\n  re:  ${JSON.stringify(fixedPoint)}`
			};
		}
		const oldHrefs = hrefSet(old);
		const extra = [...hrefSet(out)].filter((h) => !oldHrefs.has(h));
		if (extra.length > 0) {
			return {
				cls,
				failure: `#${index} [${cls}] new hrefs ${JSON.stringify(extra)} ${JSON.stringify(input)}\n  new: ${JSON.stringify(out)}\n  old: ${JSON.stringify(old)}`
			};
		}
		return { failure: null, cls };
	} catch (e) {
		return { failure: `#${index} threw ${String(e)} ${JSON.stringify(input)}`, cls: null };
	}
}

describe('renderMarkdown differential', () => {
	it('matches the old pipeline outside the divergence classes', { timeout: 180_000 }, () => {
		const generated = generateCases(439, 20_000);
		const cases = [...MARKDOWN_CORPUS, ...generated];
		const failures: string[] = [];
		const counts = { identical: 0, 'raw-block': 0, 'nested-link': 0 };
		let generatedNull = 0;
		for (let i = 0; i < cases.length; i++) {
			const { failure, cls } = compareCase(i, cases[i], renderMarkdownOrThrow);
			counts[cls ?? 'identical']++;
			if (cls === null && i >= MARKDOWN_CORPUS.length) generatedNull++;
			if (failure) failures.push(failure);
		}
		console.info(
			`markdown diff: ${cases.length} cases (${MARKDOWN_CORPUS.length} corpus), ` +
				`${counts.identical} identical-class, ${counts['raw-block']} raw-block, ` +
				`${counts['nested-link']} nested-link, generated null share ${(generatedNull / generated.length).toFixed(3)}`
		);
		if (failures.length > 0) {
			throw new Error(
				`${failures.length} of ${cases.length} cases failed. First ${Math.min(20, failures.length)}:\n` +
					failures.slice(0, 20).join('\n')
			);
		}
		// Guard against alphabet edits eroding identity coverage.
		expect(generatedNull / generated.length).toBeGreaterThanOrEqual(0.8);
	});

	it('catches broken renderers (gate self-test)', { timeout: 180_000 }, () => {
		const noAllowlist = (text: string): string => {
			const m = newMarked();
			m.use({
				renderer: {
					html() {
						return '';
					}
				}
			});
			return purify.sanitize(m.parse(text) as string, {
				...SANITIZE_CONFIG,
				ALLOWED_URI_REGEXP: /.*/
			}) as string;
		};
		const unescapedAmp = (text: string): string => oracle(text).replaceAll('&amp;', '&');
		const mutants: Record<string, (text: string) => string> = { noAllowlist, unescapedAmp };
		for (const [name, render] of Object.entries(mutants)) {
			let failed = 0;
			MARKDOWN_CORPUS.forEach((input, i) => {
				if (compareCase(i, input, render).failure) failed++;
			});
			console.info(
				`mutant ${name}: ${failed} failures over ${MARKDOWN_CORPUS.length} corpus cases`
			);
			expect(failed, name).toBeGreaterThan(0);
		}
	});
});
