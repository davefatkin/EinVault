import { decodeHTML, decodeHTMLAttribute } from 'entities';

export const ALLOWED_TAGS: readonly string[] = [
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

// Copied from DOMPurify 3.4.17 (dist/purify.cjs.js, IS_ALLOWED_URI).
const IS_ALLOWED_URI =
	// eslint-disable-next-line no-useless-escape -- verbatim copy
	/^(?:(?:(?:f|ht)tps?|mailto|tel|callto|sms|cid|xmpp|matrix):|[^a-z]|[a-z+.\-]+(?:[^a-z+.\-:]|$))/i;
// Copied from DOMPurify 3.4.17 (ATTR_WHITESPACE). It has the g flag, so use it
// only with String.replace, never with .test().
const ATTR_WHITESPACE = new RegExp(
	// eslint-disable-next-line no-control-regex -- verbatim copy
	'[\\u0000-\\u0020\\u00A0\\u1680\\u180E\\u2000-\\u2029\\u205F\\u3000]',
	'g'
);
// Copied from DOMPurify 3.4.17 (SAFE_FOR_XML check in _isUnsafeAttributeValue).
const SAFE_FOR_XML =
	/((--!?|])>)|<\/(style|script|title|xmp|textarea|noscript|iframe|noembed|noframes)/i;

const TEXT_ESCAPES: Record<string, string> = {
	'&': '&amp;',
	'<': '&lt;',
	'>': '&gt;',
	'\u00a0': '&nbsp;'
};
const TEXT_SPECIALS = new RegExp('[&<>\\u00a0]', 'g');
const ATTR_SPECIALS = new RegExp('[&"<>\\u00a0]', 'g');
const ATTR_ESCAPES: Record<string, string> = { ...TEXT_ESCAPES, '"': '&quot;' };

/** Escape set an HTML serializer uses for text nodes: & < > NBSP. */
export function escapeText(s: string): string {
	return s.replace(TEXT_SPECIALS, (c) => TEXT_ESCAPES[c]);
}

/** Escape set an HTML serializer uses for attribute values: & " NBSP < >. */
export function escapeAttr(s: string): string {
	return s.replace(ATTR_SPECIALS, (c) => ATTR_ESCAPES[c]);
}

/** Decode a text node the way an HTML parser does (NUL is dropped). */
export function decodeText(s: string): string {
	return decodeHTML(s).replaceAll('\0', '');
}

/** DOMPurify's href rules. Returns the value to emit, or null to drop it. */
export function allowedHref(decoded: string): string | null {
	const value = decoded.trim();
	if (SAFE_FOR_XML.test(value)) return null;
	if (value === '') return '';
	if (IS_ALLOWED_URI.test(value.replace(ATTR_WHITESPACE, ''))) return value;
	return null;
}

// Transcribed from marked 18.2.1 (lib/marked.esm.js, minified `xe`).
function cleanUrl(href: string): string | null {
	try {
		return encodeURI(href).replace(/%25/g, '%');
	} catch {
		return null;
	}
}

const MARKED_ESCAPES: Record<string, string> = {
	'&': '&amp;',
	'<': '&lt;',
	'>': '&gt;',
	'"': '&quot;',
	"'": '&#39;'
};

// Transcribed from marked 18.2.1 (minified `y`, the HTML escape helper). With
// encode set every & is escaped; otherwise & that starts an entity is kept.
export function markedEscape(html: string, encode: boolean): string {
	if (encode) {
		return /[&<>"']/.test(html) ? html.replace(/[&<>"']/g, (c) => MARKED_ESCAPES[c]) : html;
	}
	const noEncode = /[<>"']|&(?!(#\d{1,7}|#[Xx][a-fA-F0-9]{1,6}|\w+);)/;
	const noEncodeG = /[<>"']|&(?!(#\d{1,7}|#[Xx][a-fA-F0-9]{1,6}|\w+);)/g;
	return noEncode.test(html) ? html.replace(noEncodeG, (c) => MARKED_ESCAPES[c]) : html;
}

export type LinkHref =
	{ status: 'invalid' } | { status: 'blocked' } | { status: 'ok'; value: string };

/** Resolve a link token's href: what the browser would see, run through DOMPurify's rules. */
export function linkHref(href: string, autolink: boolean): LinkHref {
	const cleaned = cleanUrl(href);
	if (cleaned === null) return { status: 'invalid' };
	const decoded = decodeHTMLAttribute(markedEscape(cleaned, autolink));
	const value = allowedHref(decoded);
	return value === null ? { status: 'blocked' } : { status: 'ok', value };
}

const BARE_AMP = /&(?!(?:amp|quot|lt|gt|nbsp);)/;
const ANCHOR_HREF = /<a href="([^"<>]*)">/g;
const UNESCAPES: Record<string, string> = {
	amp: '&',
	quot: '"',
	lt: '<',
	gt: '>',
	nbsp: '\u00a0'
};
const TAG_FORMS = new RegExp(
	'</?(?:' +
		ALLOWED_TAGS.filter((t) => t !== 'br' && t !== 'hr' && t !== 'a').join('|') +
		')>|<(?:br|hr)>|</?a>|<a href="[^"<>]*">',
	'g'
);

/** Second layer: confirm the rendered HTML contains only what the renderer may emit. */
export function checkStructure(html: string): boolean {
	if (BARE_AMP.test(html)) return false;
	for (const m of html.matchAll(ANCHOR_HREF)) {
		const unescaped = m[1].replace(/&(amp|quot|lt|gt|nbsp);/g, (_, n: string) => UNESCAPES[n]);
		if (allowedHref(unescaped) !== unescaped) return false;
	}
	const rest = html.replace(TAG_FORMS, '');
	return !rest.includes('<') && !rest.includes('>');
}
