import { db } from '#lib/server/db/index.js';
import type { SearchEntityType } from '#lib/searchTypes.js';
export { SEARCH_ENTITY_TYPES, type SearchEntityType } from '#lib/searchTypes.js';

/** Internal index types: the public ones plus rows that surface under another type. */
type IndexEntityType = SearchEntityType | 'incident_update';

export interface SearchFilters {
	text: string;
	companionIds: string[];
	types: SearchEntityType[];
	after?: string; // YYYY-MM-DD inclusive lower bound on event_date
	before?: string; // YYYY-MM-DD inclusive upper bound
}

export function hasActiveFilters(f: SearchFilters): boolean {
	return f.companionIds.length > 0 || f.types.length > 0 || !!f.after || !!f.before;
}

/**
 * Build the shared filter WHERE fragment + bound params. Same-kind lists are OR
 * (IN), different kinds are AND. Returns an empty sql string when no filters.
 */
export function buildFilterClause(f: SearchFilters): { sql: string; params: string[] } {
	const parts: string[] = [];
	const params: string[] = [];
	if (f.companionIds.length) {
		parts.push(`s.companion_id IN (${f.companionIds.map(() => '?').join(', ')})`);
		params.push(...f.companionIds);
	}
	if (f.types.length) {
		// Update rows are indexed as 'incident_update' but surface as health.
		const types: IndexEntityType[] = f.types.includes('health')
			? [...f.types, 'incident_update']
			: f.types;
		parts.push(`s.entity_type IN (${types.map(() => '?').join(', ')})`);
		params.push(...types);
	}
	if (f.after) {
		parts.push('s.event_date >= ?');
		params.push(f.after);
	}
	if (f.before) {
		parts.push('s.event_date <= ?');
		params.push(f.before);
	}
	return { sql: parts.join(' AND '), params };
}

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
	IndexEntityType,
	(companionId: string, date: string, id: string) => string
> = {
	journal: (c, d) => `/${c}/journal/${d}`,
	daily: (c, d) => `/${c}/journal/${d}`,
	health: (c, _d, id) => `/${c}/health?detailHealth=${id}`,
	incident_update: (c, _d, id) => `/${c}/health?incidentUpdate=${id}`,
	weight: (c, _d, id) => `/${c}/health?detailWeight=${id}`,
	reminder: (c, _d, id) => `/${c}/reminders?detail=${id}`,
	document: (c, _d, id) => `/${c}/documents?preview=${id}`,
	media: (c, d, id) => `/${c}/journal/${d}?media=${id}`,
	note: (c, _d, id) => `/${c}/notes/${id}`,
	medication: (c, _d, id) => `/${c}/medications/${id}`,
	supply: (c, _d, id) => `/${c}/supplies/${id}`
};

/**
 * A supply has one index row per linked companion. Keep the row of one pet so
 * it shows once and its id stays unique in the palette: among the pets the
 * companion filter allows, active ones first, then by name.
 */
export function supplyOnceClause(companionIds: string[]): { sql: string; params: string[] } {
	const allowed = companionIds.length
		? ` AND sc.companion_id IN (${companionIds.map(() => '?').join(', ')})`
		: '';
	return {
		sql: `(s.entity_type <> 'supply' OR s.companion_id = (
				SELECT sc.companion_id FROM supply_companions sc
				JOIN companions sc_c ON sc_c.id = sc.companion_id
				WHERE sc.supply_id = s.entity_id${allowed}
				ORDER BY sc_c.is_active DESC, sc_c.name, sc_c.id
				LIMIT 1
			))`,
		params: companionIds
	};
}

interface SearchRow {
	entity_type: IndexEntityType;
	entity_id: string;
	companion_id: string;
	companion_name: string;
	title: string;
	excerpt: string;
	event_date: string | null;
}

/** Members/admins only — the API route gates caretakers out with 403. */
export function search(filters: SearchFilters): SearchResult[] {
	const match = buildMatchQuery(filters.text);
	const fc = buildFilterClause(filters);
	const once = supplyOnceClause(filters.companionIds);
	let rows: SearchRow[];

	if (match) {
		const where = ['search_index MATCH ?', fc.sql, once.sql].filter(Boolean).join(' AND ');
		const stmt = db.$client.prepare(`
			SELECT
				s.entity_type, s.entity_id, s.companion_id, s.event_date, s.title,
				snippet(search_index, 1, char(1), char(2), '…', 8) AS excerpt,
				c.name AS companion_name
			FROM search_index s
			JOIN companions c ON c.id = s.companion_id
			WHERE ${where}
			ORDER BY bm25(search_index), s.event_date DESC
			LIMIT 20
		`);
		rows = stmt.all(match, ...fc.params, ...once.params) as SearchRow[];
	} else if (hasActiveFilters(filters)) {
		// Browse: filters only, no MATCH. FTS5 full-scans the virtual table by the
		// UNINDEXED columns (no B-tree index possible on an FTS5 table — do not
		// CREATE INDEX). Plain body excerpt (no matched terms to highlight).
		// Relies on the index only holding data the user can already read.
		const stmt = db.$client.prepare(`
			SELECT
				s.entity_type, s.entity_id, s.companion_id, s.event_date, s.title,
				substr(s.body, 1, 80) AS excerpt,
				c.name AS companion_name
			FROM search_index s
			JOIN companions c ON c.id = s.companion_id
			WHERE ${fc.sql} AND ${once.sql}
			ORDER BY s.event_date DESC
			LIMIT 20
		`);
		rows = stmt.all(...fc.params, ...once.params) as SearchRow[];
	} else {
		return [];
	}

	return rows.map((r) => ({
		type: r.entity_type === 'incident_update' ? 'health' : r.entity_type,
		id: r.entity_id,
		companionId: r.companion_id,
		companionName: r.companion_name,
		title: r.title,
		snippet: r.excerpt,
		date: r.event_date ?? '',
		href: HREF_BY_TYPE[r.entity_type](r.companion_id, r.event_date ?? '', r.entity_id)
	}));
}
