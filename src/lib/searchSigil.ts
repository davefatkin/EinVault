export interface SigilToken {
	sigil: '@' | '#';
	partial: string;
	/** index in the input where the sigil starts (for splicing it out). */
	start: number;
}

/**
 * Detect a trailing @ or # token currently being typed. The sigil must be at
 * string start or right after whitespace (so `a@b` email text never triggers).
 * The partial may be empty (sigil just typed → show the full list).
 */
export function parseSigilToken(value: string): SigilToken | null {
	const m = /(?:^|(?<=\s))([@#])(\S*)$/.exec(value);
	if (!m) return null;
	return { sigil: m[1] as '@' | '#', partial: m[2], start: m.index };
}

/** Remove the trailing sigil token from the value (after a selection). */
export function stripSigilToken(value: string, token: SigilToken): string {
	return value.slice(0, token.start);
}
