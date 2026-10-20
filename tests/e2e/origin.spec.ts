import { test as base, expect } from '@playwright/test';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { test } from '../lib/fixtures';
import { createSeededDb } from '../lib/seed';
import { startAppServer } from '../lib/app-server';

const REPO_ROOT = path.resolve(import.meta.dirname, '../..');

// Any path works: Kit's CSRF check runs before routing, so a block is a 403
// with Kit's message and a pass is anything else (404 or a redirect).
const PROBE = '/__origin-probe';
const FORM = { 'Content-Type': 'application/x-www-form-urlencoded' };
const CSRF_MESSAGE = 'Cross-site POST form submissions are forbidden';

// node:http rather than Playwright's request API, which controls Host itself.
function post(
	port: number,
	target: string,
	headers: Record<string, string>,
	body = ''
): Promise<{ status: number; body: string }> {
	return new Promise((resolve, reject) => {
		const req = http.request(
			{ host: '127.0.0.1', port, method: 'POST', path: target, headers },
			(res) => {
				let text = '';
				res.on('data', (chunk) => (text += chunk));
				res.on('end', () => resolve({ status: res.statusCode ?? 0, body: text }));
			}
		);
		req.on('error', reject);
		req.end(body);
	});
}

test.describe('ORIGIN wrapper', () => {
	test('same-origin form POST passes CSRF', async ({ app }) => {
		const { port } = app.server;
		const res = await post(
			port,
			PROBE,
			{ ...FORM, Host: `localhost:${port}`, Origin: `http://localhost:${port}` },
			'x=1'
		);
		expect(res.status).not.toBe(403);
		expect(res.body).not.toContain(CSRF_MESSAGE);
	});

	test('a forged synthetic host header is overwritten', async ({ app }) => {
		const { port } = app.server;
		// Both schemes: with the overwrite broken, the adapter's default proto
		// (https) would make the second one match.
		for (const origin of ['http://evil.test', 'https://evil.test']) {
			const res = await post(
				port,
				PROBE,
				{
					...FORM,
					Host: `localhost:${port}`,
					'x-einvault-origin-host': 'evil.test',
					Origin: origin
				},
				'x=1'
			);
			expect(res.status, origin).toBe(403);
			expect(res.body, origin).toContain(CSRF_MESSAGE);
		}
	});

	test('a forged synthetic proto header is overwritten', async ({ app }) => {
		const { port } = app.server;
		const res = await post(
			port,
			PROBE,
			{
				...FORM,
				Host: `localhost:${port}`,
				'x-einvault-origin-proto': 'https',
				Origin: `https://localhost:${port}`
			},
			'x=1'
		);
		expect(res.status).toBe(403);
		expect(res.body).toContain(CSRF_MESSAGE);
	});

	test('the Host header does not set the origin', async ({ app }) => {
		const { port } = app.server;
		for (const origin of ['http://evil.test', 'https://evil.test']) {
			const res = await post(port, PROBE, { ...FORM, Host: 'evil.test', Origin: origin }, 'x=1');
			expect(res.status, origin).toBe(403);
			expect(res.body, origin).toContain(CSRF_MESSAGE);
		}
	});
});

test.describe('API requests without a Content-Type', () => {
	const EXECUTE = '/api/quick-logs/does-not-exist/execute';

	test('a Bearer call from a foreign origin reaches auth', async ({ app }) => {
		const res = await post(app.server.port, EXECUTE, {
			Authorization: 'Bearer evk_not-a-real-token',
			Origin: 'http://evil.test'
		});
		expect(res.status).toBe(401);
	});

	test('a Bearer call that carries a cookie keeps the CSRF check', async ({ app }) => {
		const res = await post(app.server.port, EXECUTE, {
			Authorization: 'Bearer evk_not-a-real-token',
			Cookie: 'einvault_session=anything',
			Origin: 'https://evil.example'
		});
		expect(res.status).toBe(403);
		expect(res.body).toContain(CSRF_MESSAGE);
	});

	test('a cross-site call without Bearer is still blocked', async ({ app }) => {
		const cases: Record<string, string>[] = [
			{ Origin: 'http://evil.test' },
			{ Origin: 'http://evil.test', Authorization: 'Basic Zm9vOmJhcg==' }
		];
		for (const headers of cases) {
			const res = await post(app.server.port, EXECUTE, headers);
			expect(res.status, JSON.stringify(headers)).toBe(403);
		}
	});
});

base.describe('proxy headers without ORIGIN', () => {
	// eslint-disable-next-line no-empty-pattern
	base('forwarded proto and host set the origin', async ({}, testInfo) => {
		const dir = path.join(REPO_ROOT, '.test-data', `origin-proxy-${testInfo.workerIndex}`);
		const server = await startAppServer({
			dbPath: createSeededDb(dir),
			omitOrigin: true,
			env: { PROTOCOL_HEADER: 'x-forwarded-proto', HOST_HEADER: 'x-forwarded-host' }
		});
		try {
			const forwarded = {
				...FORM,
				'x-forwarded-proto': 'https',
				'x-forwarded-host': 'einvault.example.com'
			};
			const ok = await post(
				server.port,
				PROBE,
				{ ...forwarded, Origin: 'https://einvault.example.com' },
				'x=1'
			);
			expect(ok.status).not.toBe(403);
			expect(ok.body).not.toContain(CSRF_MESSAGE);
			const foreign = await post(
				server.port,
				PROBE,
				{ ...forwarded, Origin: 'http://evil.test' },
				'x=1'
			);
			expect(foreign.status).toBe(403);
		} finally {
			await server.stop();
			fs.rmSync(dir, { recursive: true, force: true });
		}
	});

	// eslint-disable-next-line no-empty-pattern
	base('an invalid ORIGIN stops startup', async ({}, testInfo) => {
		const dir = path.join(REPO_ROOT, '.test-data', `origin-bad-${testInfo.workerIndex}`);
		try {
			await expect(
				startAppServer({
					dbPath: createSeededDb(dir),
					env: { ORIGIN: 'ftp://einvault.example.com' }
				})
			).rejects.toThrow(/ORIGIN must be an http/);
		} finally {
			fs.rmSync(dir, { recursive: true, force: true });
		}
	});
});
