import { error } from '@sveltejs/kit';
import { t, type Locale } from '$lib/i18n';

export const PAGE_DEFAULT_LIMIT = 50;
export const PAGE_MAX_LIMIT = 200;
export const PAGE_MAX_OFFSET = 100_000;

function intParam(raw: string | null, def: number): number {
	if (raw === null || raw === '') return def;
	if (!/^\d+$/.test(raw)) return NaN;
	return Number(raw);
}

// Parse ?limit=&offset= for the paginated list endpoints. Rejects a present-but-
// invalid value with a stable code rather than silently clamping. limit is
// bounded [1, PAGE_MAX_LIMIT] (default PAGE_DEFAULT_LIMIT); offset is bounded
// [0, PAGE_MAX_OFFSET] to block deep-scan pagination.
export function parsePagination(url: URL, locale: Locale): { limit: number; offset: number } {
	const limit = intParam(url.searchParams.get('limit'), PAGE_DEFAULT_LIMIT);
	const offset = intParam(url.searchParams.get('offset'), 0);
	if (
		!Number.isInteger(limit) ||
		limit < 1 ||
		limit > PAGE_MAX_LIMIT ||
		!Number.isInteger(offset) ||
		offset < 0 ||
		offset > PAGE_MAX_OFFSET
	) {
		error(400, { code: 'invalidPagination', message: t(locale, 'error.invalidPagination') });
	}
	return { limit, offset };
}

// Runs a paginated fetch: parses limit/offset, over-fetches by one to detect a
// further page, and slices back to the page size. `fetch(take, offset)` should
// pass `take`/`offset` straight into the query's limit/offset.
export async function paginate<T>(
	url: URL,
	locale: Locale,
	fetch: (take: number, offset: number) => Promise<T[]>
): Promise<{ page: T[]; hasMore: boolean }> {
	const { limit, offset } = parsePagination(url, locale);
	const rows = await fetch(limit + 1, offset);
	const hasMore = rows.length > limit;
	return { page: hasMore ? rows.slice(0, limit) : rows, hasMore };
}
