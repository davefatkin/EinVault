// Strip markdown syntax characters for compact, single-line previews.
export function stripMarkdown(text: string): string {
	return text.replace(/[#*_`~>[\]]/g, '').trim();
}
