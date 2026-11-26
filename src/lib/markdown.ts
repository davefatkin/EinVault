import { Marked, type RendererObject } from 'marked';
import {
	checkStructure,
	decodeText,
	escapeAttr,
	escapeText,
	linkHref,
	markedEscape
} from '#lib/markdown-safety.js';

// The renderer writes only allowlisted tags (ALLOWED_TAGS in markdown-safety)
// and escapes every piece of text, so no HTML sanitizer or DOM is needed. The
// output matches what marked + DOMPurify produced before, including the
// quirks for constructs outside the allowlist, which are reproduced below.

// Per-render state, reset by renderMarkdownOrThrow. It is module-level, so
// rendering is not reentrant and must stay synchronous.
// Depth of the link being rendered. A link inside a link renders only its
// children, since nested anchors are not valid HTML.
let linkDepth = 0;
// Set once marked has passed raw text containing a tag-like '<' after a raw-block tag
// (<pre>, <code>, <kbd>, <script>). The old pipeline handed that text to an
// HTML parser, which could swallow any later markup into a comment or tag, so
// later links render as their text only and never add an href.
let afterRawMarkup = false;
// Only exists to match the old output's whitespace; it never affects safety.
// True when the last thing marked wrote was text ending in CR. The HTML parser
// read marked's output with CRLF folded to LF, so a CR and an LF that marked
// wrote with nothing but dropped raw HTML between them became one LF.
let pendingCR = false;

/** Text marked's default renderer would emit for `s`, as a browser would show it. */
function markedText(s: string): string {
	// marked decodes numeric references in text, so a CR can reach its output;
	// the HTML parser turned CR and CRLF into LF before reading entities.
	let raw = markedEscape(s, false);
	const joined = pendingCR && raw.startsWith('\n');
	if (joined) raw = raw.slice(1);
	if (raw !== '' || joined) pendingCR = raw.endsWith('\r');
	return escapeText(decodeText(raw.replace(/\r\n?/g, '\n')));
}

/** Text marked escapes in full (code, autolinks): no entity can survive, only NUL is dropped. */
function literalText(s: string): string {
	return escapeText(s.replaceAll('\0', ''));
}

/** Output that marked wrapped in tags: text on either side of it never joined. */
function tagged(render: () => string): string {
	pendingCR = false;
	const html = render();
	pendingCR = false;
	return html;
}

export const markdownRenderer = {
	space() {
		return '';
	},
	code({ text }) {
		// DOMPurify drops the class attribute, so the language-* class never survives.
		const body = text ? text.replace(/\n$/, '') + '\n' : '';
		return tagged(() => `<pre><code>${literalText(body)}</code></pre>\n`);
	},
	blockquote({ tokens }) {
		return tagged(() => `<blockquote>\n${this.parser.parse(tokens)}</blockquote>\n`);
	},
	html() {
		return '';
	},
	def() {
		return '';
	},
	heading({ tokens, depth }) {
		return tagged(() => `<h${depth}>${this.parser.parseInline(tokens)}</h${depth}>\n`);
	},
	hr() {
		return tagged(() => '<hr>\n');
	},
	list(token) {
		// DOMPurify drops the start attribute of <ol> (not in ALLOWED_ATTR).
		const tag = token.ordered ? 'ol' : 'ul';
		return tagged(() => {
			let body = '';
			for (const item of token.items) body += this.listitem(item);
			return `<${tag}>\n${body}</${tag}>\n`;
		});
	},
	listitem(item) {
		return tagged(() => `<li>${this.parser.parse(item.tokens)}</li>\n`);
	},
	checkbox() {
		// DOMPurify removes the <input> but keeps the space marked writes after it.
		return tagged(() => ' ');
	},
	paragraph({ tokens }) {
		return tagged(() => `<p>${this.parser.parseInline(tokens)}</p>\n`);
	},
	table(token) {
		// DOMPurify unwraps table, tbody, tr and td keeping their text, and drops
		// thead with its content (FORBID_CONTENTS), so only body cell text remains.
		return tagged(() => {
			// The header still went through the HTML parser before DOMPurify dropped
			// it, so render it for its effect on per-render state, then discard it.
			for (const cell of token.header) this.tablecell(cell);
			let rows = '';
			for (const row of token.rows) {
				let cells = '';
				for (const cell of row) cells += this.tablecell(cell);
				rows += this.tablerow({ text: cells });
			}
			return `\n\n${rows}\n`;
		});
	},
	tablerow({ text }) {
		// The <tr> tags are unwrapped; the newlines marked writes inside them stay.
		return tagged(() => `\n${text}\n`);
	},
	tablecell({ tokens }) {
		// The <td> tags are unwrapped; the cell text and its newline stay.
		return tagged(() => `${this.parser.parseInline(tokens)}\n`);
	},
	strong({ tokens }) {
		return tagged(() => `<strong>${this.parser.parseInline(tokens)}</strong>`);
	},
	em({ tokens }) {
		return tagged(() => `<em>${this.parser.parseInline(tokens)}</em>`);
	},
	codespan({ text }) {
		return tagged(() => `<code>${literalText(text)}</code>`);
	},
	br() {
		return tagged(() => '<br>');
	},
	del({ tokens }) {
		return tagged(() => `<del>${this.parser.parseInline(tokens)}</del>`);
	},
	link({ href, text, tokens, autolink }) {
		const resolved = linkHref(href, !!autolink);
		const children = (): string => (autolink ? literalText(text) : this.parser.parseInline(tokens));
		// marked's own renderer writes only the children when it cannot clean the URL.
		if (resolved.status === 'invalid') return children();
		return tagged(() => {
			if (linkDepth > 0 || afterRawMarkup) return children();
			linkDepth++;
			let inner: string;
			try {
				inner = children();
			} finally {
				linkDepth--;
			}
			if (resolved.status === 'blocked') return `<a>${inner}</a>`;
			return `<a href="${escapeAttr(resolved.value)}">${inner}</a>`;
		});
	},
	image({ href, text, tokens }) {
		// DOMPurify removes <img> entirely; only marked's alt-text fallback for a
		// URL it cannot clean reaches the output, as plain text.
		if (linkHref(href, false).status !== 'invalid') return tagged(() => '');
		const alt = tokens ? this.parser.parseInline(tokens, this.parser.textRenderer) : text;
		return markedText(alt);
	},
	text(token) {
		if ('tokens' in token && token.tokens) return this.parser.parseInline(token.tokens);
		// Raw-block text (escaped: true) is escaped like any other text.
		// Only a '<' the HTML tokenizer treats as markup counts: one followed by a letter
		// (tag), '!' (declaration or comment), '/' (end tag) or '?' (bogus comment), or a
		// trailing '<' that joins whatever marked emits next. '<' before a space or
		// digit stays plain text, so code such as "a < b" keeps later links.
		if ('escaped' in token && token.escaped && /<(?:[A-Za-z!/?]|$)/.test(token.text))
			afterRawMarkup = true;
		return markedText(token.text);
	}
} satisfies Required<RendererObject>;

// `breaks: true` turns single newlines into <br> so users' line breaks in
// journal/notes show up as written (CommonMark would otherwise collapse them).
const md = new Marked({ gfm: true, breaks: true, async: false, silent: false });
md.use({ renderer: markdownRenderer });

/** Render markdown to safe HTML; throws if rendering fails or the output fails the structural check. */
export function renderMarkdownOrThrow(text: string): string {
	linkDepth = 0;
	afterRawMarkup = false;
	pendingCR = false;
	const html = md.parse(text) as string;
	if (!checkStructure(html)) throw new Error('Rendered markdown failed the structural check');
	return html;
}

let reportedFailure = false;

/** Render markdown to safe HTML. Never throws: on failure it shows the source as escaped text. */
export function renderMarkdown(text: string): string {
	try {
		return renderMarkdownOrThrow(text);
	} catch (err) {
		if (!reportedFailure) {
			reportedFailure = true;
			console.error('renderMarkdown failed; showing the source as plain text', err);
		}
		return `<p>${escapeText(text)}</p>`;
	}
}
