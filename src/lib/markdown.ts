import { marked } from 'marked';
import DOMPurify from 'isomorphic-dompurify';

// Strip all HTML and dangerous URI schemes; DOMPurify is the final safety net.
marked.use({
	renderer: {
		html() {
			return '';
		}
	}
});

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

// Strip markdown syntax characters for compact, single-line previews.
export function stripMarkdown(text: string): string {
	return text.replace(/[#*_`~>[\]]/g, '').trim();
}

export function renderMarkdown(text: string): string {
	// `breaks: true` turns single newlines into <br> so users' line breaks in
	// journal/notes show up as written (CommonMark would otherwise collapse them).
	const raw = marked.parse(text, { async: false, gfm: true, breaks: true }) as string;
	return DOMPurify.sanitize(raw, {
		ALLOWED_TAGS,
		ALLOWED_ATTR: ['href', 'rel'],
		ALLOW_DATA_ATTR: false,
		FORCE_BODY: false
	});
}
