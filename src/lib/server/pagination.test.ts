import { describe, it, expect } from 'vitest';
import { parsePagination } from './pagination';

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
});
