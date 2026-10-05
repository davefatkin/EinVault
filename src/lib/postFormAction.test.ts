import { describe, it, expect, vi, afterEach } from 'vitest';
import { postFormAction } from './postFormAction';

function stubFetch(body: string, status = 200) {
	const fetchMock = vi.fn(async () => new Response(body, { status }));
	vi.stubGlobal('fetch', fetchMock);
	return fetchMock;
}

afterEach(() => {
	vi.unstubAllGlobals();
});

describe('postFormAction', () => {
	it('sends the ActionResult headers', async () => {
		const fetchMock = stubFetch(JSON.stringify({ type: 'success', status: 200, data: '-1' }));
		await postFormAction('?/save', new FormData());
		const [url, init] = fetchMock.mock.calls[0] as unknown as [
			string,
			{ method: string; headers: Record<string, string> }
		];
		expect(url).toBe('?/save');
		expect(init.method).toBe('POST');
		expect(init.headers).toMatchObject({ accept: 'application/json' });
	});

	it('reports a success result as saved', async () => {
		stubFetch(JSON.stringify({ type: 'success', status: 200, data: '-1' }));
		expect(await postFormAction('?/save', new FormData())).toBe('saved');
	});

	it('reports the route guard 401 as signed out', async () => {
		stubFetch(JSON.stringify({ type: 'error', error: { message: 'Unauthorized' } }), 401);
		expect(await postFormAction('?/save', new FormData())).toBe('signedOut');
	});

	it('reports an action fail(401) as signed out', async () => {
		stubFetch(JSON.stringify({ type: 'failure', status: 401, data: '[{"error":1},"x"]' }));
		expect(await postFormAction('?/save', new FormData())).toBe('signedOut');
	});

	it('reports other failures as failed', async () => {
		stubFetch(JSON.stringify({ type: 'failure', status: 400, data: '[{"error":1},"x"]' }));
		expect(await postFormAction('?/save', new FormData())).toBe('failed');
	});

	it('reports a redirect result as failed', async () => {
		stubFetch(JSON.stringify({ type: 'redirect', status: 303, location: '/' }));
		expect(await postFormAction('?/save', new FormData())).toBe('failed');
	});

	it('reports an HTML page as failed', async () => {
		stubFetch('<!doctype html><html></html>');
		expect(await postFormAction('?/save', new FormData())).toBe('failed');
	});

	it('reports a network error as failed', async () => {
		vi.stubGlobal(
			'fetch',
			vi.fn(async () => {
				throw new TypeError('offline');
			})
		);
		expect(await postFormAction('?/save', new FormData())).toBe('failed');
	});
});
