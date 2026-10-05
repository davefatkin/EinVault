import { test as base, expect } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { createSeededDb } from '../lib/seed';
import { startAppServer, type AppServer } from '../lib/app-server';

const REPO_ROOT = path.resolve(import.meta.dirname, '../..');

// Boots a dedicated server with a tiny per-IP API budget. The shared worker
// servers raise the limit so specs don't trip over each other.
const test = base.extend<{ server: AppServer }>({
	// eslint-disable-next-line no-empty-pattern
	server: async ({}, use, testInfo) => {
		const dir = path.join(
			REPO_ROOT,
			'.test-data',
			`api-rate-limit-${testInfo.workerIndex}-${testInfo.testId}`
		);
		const dbPath = createSeededDb(dir);
		const server = await startAppServer({
			dbPath,
			env: { API_RATE_LIMIT_PER_MINUTE: '2' }
		});
		await use(server);
		await server.stop();
		fs.rmSync(dir, { recursive: true, force: true });
	}
});

test('API_RATE_LIMIT_PER_MINUTE caps Bearer API requests per client IP', async ({
	server,
	request
}) => {
	// The per-IP check runs before the token lookup, so bad tokens count too.
	const call = () =>
		request.get(server.baseURL + '/api/quick-logs', {
			headers: { Authorization: 'Bearer evk_whatever' }
		});
	expect((await call()).status()).toBe(401);
	expect((await call()).status()).toBe(401);
	const limited = await call();
	expect(limited.status()).toBe(429);
	expect((await limited.json()).code).toBe('rateLimited');
});
