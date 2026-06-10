import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { startPaperlessFake, makePaperlessDoc, type PaperlessFake } from './paperless';

describe('paperless fake', () => {
	let fake: PaperlessFake;
	const auth = () => ({ authorization: `Token ${fake.token}` });

	beforeAll(async () => {
		fake = await startPaperlessFake();
		fake.setDocuments([
			makePaperlessDoc(1, { title: 'Vaccination record', tags: [7] }),
			makePaperlessDoc(2, { title: 'Insurance policy', tags: [7] }),
			makePaperlessDoc(3, { title: 'Receipt', tags: [9] })
		]);
	});
	afterAll(async () => {
		await fake.stop();
	});

	it('rejects a wrong token', async () => {
		const res = await fetch(`${fake.url}/api/documents/`, {
			headers: { authorization: 'Token wrong' }
		});
		expect(res.status).toBe(401);
	});

	it('filters by tag and query, never exposes content in listings', async () => {
		const tagged = await fetch(`${fake.url}/api/documents/?tags__id__all=7`, { headers: auth() });
		const taggedBody = (await tagged.json()) as { results: Record<string, unknown>[] };
		expect(taggedBody.results).toHaveLength(2);
		expect(taggedBody.results[0]).not.toHaveProperty('content');

		const queried = await fetch(`${fake.url}/api/documents/?query=insurance`, { headers: auth() });
		const queriedBody = (await queried.json()) as { results: { title: string }[] };
		expect(queriedBody.results).toHaveLength(1);
		expect(queriedBody.results[0].title).toBe('Insurance policy');
	});

	it('serves detail, download bytes, and thumbnails', async () => {
		const detail = await fetch(`${fake.url}/api/documents/1/`, { headers: auth() });
		const detailBody = (await detail.json()) as Record<string, unknown>;
		expect(detailBody.title).toBe('Vaccination record');
		expect(detailBody).not.toHaveProperty('content');

		const dl = await fetch(`${fake.url}/api/documents/1/download/`, { headers: auth() });
		expect(dl.headers.get('content-type')).toBe('application/pdf');
		expect((await dl.text()).startsWith('%PDF')).toBe(true);

		const thumb = await fetch(`${fake.url}/api/documents/1/thumb/`, { headers: auth() });
		expect(thumb.headers.get('content-type')).toBe('image/png');

		expect((await fetch(`${fake.url}/api/documents/99/`, { headers: auth() })).status).toBe(404);
	});
});
