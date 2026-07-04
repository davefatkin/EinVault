import { describe, it, expect } from 'vitest';
import { parsePagination, paginate } from './pagination';

const u = (qs: string) => new URL(`http://x/api/logs${qs}`);

describe('parsePagination', () => {
	it('defaults to limit 50 offset 0', () => {
		expect(parsePagination(u(''), 'en')).toEqual({ limit: 50, offset: 0 });
	});
	it('accepts valid values', () => {
		expect(parsePagination(u('?limit=10&offset=20'), 'en')).toEqual({ limit: 10, offset: 20 });
	});
	it('rejects limit over the max', () => {
		expect(() => parsePagination(u('?limit=999'), 'en')).toThrow();
	});
	it('rejects a non-integer limit', () => {
		expect(() => parsePagination(u('?limit=abc'), 'en')).toThrow();
	});
	it('rejects a negative offset', () => {
		expect(() => parsePagination(u('?offset=-1'), 'en')).toThrow();
	});
	it('accepts the max offset', () => {
		expect(parsePagination(u('?offset=100000'), 'en')).toEqual({ limit: 50, offset: 100000 });
	});
	it('rejects an offset past the max', () => {
		expect(() => parsePagination(u('?offset=100001'), 'en')).toThrow();
	});
});

describe('paginate', () => {
	it('reports hasMore and trims the over-fetched row when fetch returns limit + 1', async () => {
		const { page, hasMore } = await paginate(u('?limit=2'), 'en', async (take) => {
			expect(take).toBe(3);
			return [1, 2, 3];
		});
		expect(hasMore).toBe(true);
		expect(page).toEqual([1, 2]);
	});

	it('reports no hasMore and keeps every row when fetch returns <= limit', async () => {
		const { page, hasMore } = await paginate(u('?limit=2'), 'en', async () => [1]);
		expect(hasMore).toBe(false);
		expect(page).toEqual([1]);
	});
});
