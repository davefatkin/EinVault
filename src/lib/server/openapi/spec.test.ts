import { describe, it, expect } from 'vitest';
import { buildOpenApiDocument } from './spec';

describe('buildOpenApiDocument', () => {
	const doc = buildOpenApiDocument();

	it('registers every current Bearer path with its methods', () => {
		const paths = doc.paths ?? {};
		expect(Object.keys(paths['/api/logs'] ?? {})).toEqual(expect.arrayContaining(['get', 'post']));
		expect(Object.keys(paths['/api/journal'] ?? {})).toEqual(
			expect.arrayContaining(['get', 'post'])
		);
		expect(paths['/api/quick-logs']).toHaveProperty('get');
		expect(paths['/api/quick-logs/{id}/execute']).toHaveProperty('post');
		expect(paths['/api/companions']).toHaveProperty('get');
	});

	it('secures every operation with bearerAuth', () => {
		const ops = Object.values(doc.paths ?? {}).flatMap((p) => Object.values(p ?? {}));
		expect(ops.length).toBeGreaterThan(0);
		for (const op of ops) {
			expect(op.security).toEqual([{ bearerAuth: [] }]);
		}
	});

	it('documents the read-back query params on the GET endpoints', () => {
		const params = (doc.paths?.['/api/logs']?.get?.parameters ?? []).map((p) =>
			'name' in p ? p.name : undefined
		);
		expect(params).toEqual(expect.arrayContaining(['companionId', 'date']));
	});
});
