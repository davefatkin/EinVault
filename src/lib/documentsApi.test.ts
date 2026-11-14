import { describe, it, expect, vi, afterEach } from 'vitest';
import {
	uploadDocument,
	attachDocument,
	unlinkDocument,
	importFromPaperless,
	importAndAttach
} from './documentsApi';

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

describe('malformed responses', () => {
	it('upload returns a failure when a 200 body is not JSON', async () => {
		vi.stubGlobal(
			'fetch',
			vi.fn(async () => new Response('<html>', { status: 200 }))
		);
		const file = new File(['x'], 'a.pdf', { type: 'application/pdf' });
		expect(await uploadDocument('c1', file, {}, 'en')).toEqual({
			ok: false,
			message: 'Upload failed.'
		});
	});

	it('import returns the fallback on a 502 with a non-JSON body', async () => {
		vi.stubGlobal(
			'fetch',
			vi.fn(async () => new Response('bad gateway', { status: 502 }))
		);
		expect(await importFromPaperless('c1', 7, 'en')).toEqual({
			ok: false,
			message: 'Could not attach Paperless document.'
		});
	});
});

describe('attachDocument', () => {
	it('sends onlyIfUnlinked', async () => {
		const fetchMock = stubFetch(created);
		expect(await attachDocument('c1', 'd1', 'h1', 'en')).toEqual({ ok: true, value: null });
		const [url, init] = fetchMock.mock.calls[0] as unknown as Call;
		expect(url).toBe('/api/companions/c1/documents/d1');
		expect(init.method).toBe('PATCH');
		expect(JSON.parse(init.body as string)).toEqual({
			healthEventId: 'h1',
			onlyIfUnlinked: true
		});
	});
});

describe('unlinkDocument', () => {
	it('patches healthEventId null, guarded to the event it was on', async () => {
		const fetchMock = stubFetch(created);
		expect(await unlinkDocument('c1', 'd1', 'h1', 'en')).toEqual({ ok: true, value: null });
		const [url, init] = fetchMock.mock.calls[0] as unknown as Call;
		expect(url).toBe('/api/companions/c1/documents/d1');
		expect(init.method).toBe('PATCH');
		expect(JSON.parse(init.body as string)).toEqual({ healthEventId: null, onlyIfOn: 'h1' });
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

describe('category', () => {
	it('uploadDocument sends the category', async () => {
		const fetchMock = stubFetch(created);
		const file = new File(['%PDF'], 'scan.pdf', { type: 'application/pdf' });
		await uploadDocument('c1', file, { category: 'invoice' }, 'en');
		const [, init] = fetchMock.mock.calls[0] as unknown as Call;
		expect((init.body as FormData).get('category')).toBe('invoice');
	});

	it('importFromPaperless sends the category', async () => {
		const fetchMock = stubFetch(created);
		await importFromPaperless('c1', 7, 'en', { category: 'invoice' });
		const [, init] = fetchMock.mock.calls[0] as unknown as Call;
		expect(JSON.parse(init.body as string)).toEqual({ paperlessId: 7, category: 'invoice' });
	});
});

describe('importAndAttach', () => {
	it('links the imported document', async () => {
		const fetchMock = stubFetch(created);
		expect(await importAndAttach('c1', 7, 'h1', 'en')).toEqual({ ok: true, value: null });
		expect(fetchMock).toHaveBeenCalledTimes(2);
		const [url, init] = fetchMock.mock.calls[1] as unknown as Call;
		expect(url).toBe('/api/companions/c1/documents/d1');
		expect(init.method).toBe('PATCH');
		expect(JSON.parse(init.body as string).healthEventId).toBe('h1');
	});

	it('stops when the import fails', async () => {
		const fetchMock = stubFetch({ message: 'Paperless is down.' }, 502);
		expect(await importAndAttach('c1', 7, 'h1', 'en')).toEqual({
			ok: false,
			message: 'Paperless is down.'
		});
		expect(fetchMock).toHaveBeenCalledTimes(1);
	});
});
