export type TagCommitOptions = {
	max: number;
	// Canonical form of a tag, or null when the text can't be a tag.
	normalize: (raw: string) => string | null;
};

export type TagCommitError = 'invalid' | 'tooMany';

export type TagCommit = {
	tags: string[];
	// Parts that were not added, to leave in the input for the user to fix.
	rest: string[];
	error: TagCommitError | null;
};

// Commas separate tags in typed or pasted text.
export function splitTagText(raw: string): string[] {
	return raw
		.split(',')
		.map((s) => s.trim())
		.filter(Boolean);
}

// Add each part to `current`. Valid parts are added; invalid or over-limit parts
// are kept in `rest` with the first error, so the input can explain the problem
// instead of dropping the text. Duplicates are skipped quietly.
export function commitTags(
	current: string[],
	parts: string[],
	{ max, normalize }: TagCommitOptions
): TagCommit {
	const tags = [...current];
	const rest: string[] = [];
	let error: TagCommitError | null = null;
	for (const part of parts) {
		const tag = normalize(part);
		if (tag === null) {
			rest.push(part);
			error ??= 'invalid';
		} else if (tags.includes(tag)) {
			continue;
		} else if (tags.length >= max) {
			rest.push(part);
			error ??= 'tooMany';
		} else {
			tags.push(tag);
		}
	}
	return { tags, rest, error };
}

// Suggestions for the typed text. Text that can't be a tag matches nothing,
// rather than falling back to the full list.
export function matchSuggestions(
	suggestions: string[],
	current: string[],
	text: string,
	normalize: (raw: string) => string | null,
	limit = 6
): string[] {
	const q = text.trim() === '' ? '' : normalize(text);
	if (q === null) return [];
	return suggestions.filter((s) => !current.includes(s) && s.startsWith(q)).slice(0, limit);
}
