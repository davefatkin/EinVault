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

export function renderMarkdown(text: string): string {
	const raw = marked.parse(text, { async: false }) as string;
	return DOMPurify.sanitize(raw, {
		ALLOWED_TAGS,
		ALLOWED_ATTR: ['href', 'rel'],
		ALLOW_DATA_ATTR: false,
		FORCE_BODY: false
	});
}
