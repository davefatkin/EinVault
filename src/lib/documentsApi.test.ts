import { describe, it, expect, vi, afterEach } from 'vitest';
import { uploadDocument, attachDocument, importFromPaperless } from './documentsApi';

type Call = [string, NonNullable<Parameters<typeof fetch>[1]>];

function stubFetch(body: unknown, status = 200) {
	const fetchMock = vi.fn(
		async () =>
			new Response(JSON.stringify(body), {
				status,
				headers: { 'Content-Type': 'application/json' }
			})
	);
	vi.stubGlobal('fetch', fetchMock);
	return fetchMock;
}

afterEach(() => vi.unstubAllGlobals());

const created = { id: 'd1', title: 'scan.pdf', documentDate: '2026-01-02', storageKey: 'x' };

describe('uploadDocument', () => {
	it('posts the file with the event and date, and returns display fields', async () => {
		const fetchMock = stubFetch(created);
		const file = new File(['%PDF'], 'scan.pdf', { type: 'application/pdf' });
		const r = await uploadDocument(
			'c1',
			file,
			{ healthEventId: 'h1', documentDate: '2026-01-02' },
			'en'
		);
		expect(r).toEqual({
			ok: true,
			value: { id: 'd1', title: 'scan.pdf', documentDate: '2026-01-02' }
		});
		const [url, init] = fetchMock.mock.calls[0] as unknown as Call;
		expect(url).toBe('/api/companions/c1/documents');
		const fd = init.body as FormData;
		expect(fd.get('healthEventId')).toBe('h1');
		expect(fd.get('documentDate')).toBe('2026-01-02');
		expect((fd.get('file') as File).name).toBe('scan.pdf');
	});

	it("returns the server's message on failure", async () => {
		stubFetch({ message: 'Invalid file type.' }, 400);
		const file = new File(['x'], 'a.txt', { type: 'text/plain' });
		expect(await uploadDocument('c1', file, {}, 'en')).toEqual({
			ok: false,
			message: 'Invalid file type.'
		});
	});

	it('falls back when the network fails', async () => {
		vi.stubGlobal(
			'fetch',
			vi.fn(async () => Promise.reject(new Error('offline')))
		);
		const file = new File(['x'], 'a.pdf', { type: 'application/pdf' });
		expect(await uploadDocument('c1', file, {}, 'en')).toEqual({
			ok: false,
			message: 'Upload failed.'
		});
	});
});

describe('attachDocument', () => {
	it('patches the healthEventId', async () => {
		const fetchMock = stubFetch(created);
		expect(await attachDocument('c1', 'd1', 'h1', 'en')).toEqual({ ok: true, value: null });
		const [url, init] = fetchMock.mock.calls[0] as unknown as Call;
		expect(url).toBe('/api/companions/c1/documents/d1');
		expect(init.method).toBe('PATCH');
		expect(JSON.parse(init.body as string)).toEqual({ healthEventId: 'h1' });
	});
});

describe('importFromPaperless', () => {
	it('posts the Paperless id and returns the stored date', async () => {
		const fetchMock = stubFetch(created);
		expect(await importFromPaperless('c1', 7, 'en')).toEqual({
			ok: true,
			value: { id: 'd1', title: 'scan.pdf', documentDate: '2026-01-02' }
		});
		const [url, init] = fetchMock.mock.calls[0] as unknown as Call;
		expect(url).toBe('/api/companions/c1/documents/from-paperless');
		expect(JSON.parse(init.body as string)).toEqual({ paperlessId: 7 });
	});
});
