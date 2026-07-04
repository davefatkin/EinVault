import { test as base, expect } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { createSeededDb, SEED } from '../lib/seed';
import { startAppServer, type AppServer } from '../lib/app-server';
import { getFreePort } from '../lib/ports';

const REPO_ROOT = path.resolve(import.meta.dirname, '../..');

// Boots a dedicated server with API_TOKENS_ENABLED=false so we can assert the
// kill switch hides the settings card and 404s the endpoints. Env-variant
// servers can't use the shared cached storageState, so we log in via the form.
const test = base.extend<{ server: AppServer }>({
	// eslint-disable-next-line no-empty-pattern
	server: async ({}, use, testInfo) => {
		const dir = path.join(
			REPO_ROOT,
			'.test-data',
			`apitokens-off-${testInfo.workerIndex}-${testInfo.testId}`
		);
		const port = await getFreePort();
		const dbPath = createSeededDb(dir);
		const server = await startAppServer({
			dbPath,
			env: { PORT: String(port), API_TOKENS_ENABLED: 'false' }
		});
		await use(server);
		await server.stop();
		fs.rmSync(dir, { recursive: true, force: true });
	}
});

test('API_TOKENS_ENABLED=false hides the settings card and 404s the endpoints', async ({
	server,
	page
}) => {
	await page.goto(server.baseURL + '/auth/login');
	await page.getByLabel('Username').fill(SEED.member.username);
	await page.getByLabel('Password').fill(SEED.password);
	await page.getByRole('button', { name: 'Sign in' }).click();
	await expect(page).not.toHaveURL(/auth\/login/, { timeout: 8_000 });

	await page.goto(server.baseURL + '/settings');
	// The page rendered but the API tokens card must not.
	await expect(page.getByText('API tokens', { exact: true })).toHaveCount(0, { timeout: 8_000 });

	// Endpoints 404 regardless of token while disabled.
	const res = await page.request.post(server.baseURL + '/api/logs', {
		headers: { Authorization: 'Bearer evk_whatever' },
		data: { companionId: 'seed-comp-ein', type: 'walk' }
	});
	expect(res.status()).toBe(404);
	// Killswitch 404 still carries the stable envelope so devices can branch on it.
	expect((await res.json()).code).toBe('notFound');

	const list = await page.request.get(server.baseURL + '/api/quick-logs', {
		headers: { Authorization: 'Bearer evk_whatever' }
	});
	expect(list.status()).toBe(404);

	const spec = await page.request.get(server.baseURL + '/api/openapi.json');
	expect(spec.status()).toBe(404);
	expect((await spec.json()).code).toBe('notFound');
});

test('API_TOKENS_ENABLED=false hides the per-user API access control in the admin manage drawer', async ({
	server,
	page
}) => {
	await page.goto(server.baseURL + '/auth/login');
	await page.getByLabel('Username').fill(SEED.admin.username);
	await page.getByLabel('Password').fill(SEED.password);
	await page.getByRole('button', { name: 'Sign in' }).click();
	await expect(page).not.toHaveURL(/auth\/login/, { timeout: 8_000 });

	await page.goto(server.baseURL + '/admin/users');
	const row = page.locator('div.px-6.py-4').filter({ hasText: SEED.member.username });
	await expect(row).toBeVisible({ timeout: 8_000 });
	await row.getByRole('button', { name: /manage/i }).click();
	const dialog = page.getByRole('dialog');
	await expect(dialog).toBeVisible({ timeout: 4_000 });

	// Drawer opens, but the API access section and its grant/revoke toggle must be
	// gone while the killswitch is on.
	await expect(dialog.getByText('API access', { exact: true })).toHaveCount(0);
	await expect(dialog.getByRole('button', { name: /API access/i })).toHaveCount(0);
});
