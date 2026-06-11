import { db } from '$lib/server/db';

export type SearchEntityType =
	| 'journal'
	| 'health'
	| 'reminder'
	| 'document'
	| 'daily'
	| 'weight'
	| 'media';

export interface SearchResult {
	type: SearchEntityType;
	id: string;
	companionId: string;
	companionName: string;
	title: string;
	/** Excerpt with \x01/\x02 sentinel pairs around matched terms. Plain text otherwise. */
	snippet: string;
	date: string;
	href: string;
}

/**
 * Build an FTS5 MATCH expression from raw user input. Each whitespace token is
 * stripped of double quotes and wrapped as "token"* — quoting renders every
 * FTS5 operator literal, which makes the expression injection-proof. Returns
 * null when nothing searchable remains (caller returns empty results).
 */
export function buildMatchQuery(raw: string): string | null {
	const trimmed = raw.trim();
	if (trimmed.length < 2) return null;
	const tokens = trimmed
		.split(/\s+/)
		.map((t) => t.replaceAll('"', ''))
		.filter((t) => t.length > 0)
		.map((t) => `"${t}"*`);
	if (tokens.length === 0) return null;
	return tokens.join(' ');
}

const HREF_BY_TYPE: Record<
	SearchEntityType,
	(companionId: string, date: string, id: string) => string
> = {
	journal: (c, d) => `/${c}/journal/${d}`,
	daily: (c, d) => `/${c}/journal/${d}`,
	health: (c, _d, id) => `/${c}/health?detailHealth=${id}`,
	weight: (c, _d, id) => `/${c}/health?detailWeight=${id}`,
	reminder: (c, _d, id) => `/${c}/reminders?detail=${id}`,
	document: (c, _d, id) => `/${c}/documents?preview=${id}`,
	media: (c, d, id) => `/${c}/journal/${d}?media=${id}`
};

interface SearchRow {
	entity_type: SearchEntityType;
	entity_id: string;
	companion_id: string;
	companion_name: string;
	title: string;
	excerpt: string;
	event_date: string | null;
}

/** Members/admins only — the API route gates caretakers out with 403. */
export function search(rawQuery: string): SearchResult[] {
	const match = buildMatchQuery(rawQuery);
	if (!match) return [];
	// drizzle has no FTS5 support; raw prepared statement on the underlying client.
	const stmt = db.$client.prepare(`
		SELECT
			s.entity_type, s.entity_id, s.companion_id, s.event_date, s.title,
			snippet(search_index, 1, char(1), char(2), '…', 8) AS excerpt,
			c.name AS companion_name
		FROM search_index s
		JOIN companions c ON c.id = s.companion_id
		WHERE search_index MATCH ?
		ORDER BY bm25(search_index), s.event_date DESC
		LIMIT 20
	`);
	const rows = stmt.all(match) as SearchRow[];
	return rows.map((r) => ({
		type: r.entity_type,
		id: r.entity_id,
		companionId: r.companion_id,
		companionName: r.companion_name,
		title: r.title,
		snippet: r.excerpt,
		date: r.event_date ?? '',
		href: HREF_BY_TYPE[r.entity_type](r.companion_id, r.event_date ?? '', r.entity_id)
	}));
}
