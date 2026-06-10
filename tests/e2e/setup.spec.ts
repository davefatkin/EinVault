import { test as base, expect } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { createEmptyDb } from '../lib/seed';
import { startAppServer, type AppServer } from '../lib/app-server';

const REPO_ROOT = path.resolve(import.meta.dirname, '../..');

const test = base.extend<{ pristine: AppServer }>({
	// eslint-disable-next-line no-empty-pattern
	pristine: async ({}, use, testInfo) => {
		const dir = path.join(
			REPO_ROOT,
			'.test-data',
			`setup-${testInfo.workerIndex}-${testInfo.testId}`
		);
		const dbPath = createEmptyDb(dir);
		const server = await startAppServer({ dbPath });
		await use(server);
		await server.stop();
		fs.rmSync(dir, { recursive: true, force: true });
	}
});

test.describe.configure({ mode: 'serial' });

test('root redirects to /setup when no users exist', async ({ pristine, page }) => {
	await page.goto(pristine.baseURL + '/');
	await expect(page).toHaveURL(/\/setup$/);
});

test('completes setup, creates admin, lands logged in', async ({ pristine, page }) => {
	await page.goto(pristine.baseURL + '/setup');
	await page.locator('#displayName').fill('First Admin');
	await page.locator('#username').fill('firstadmin');
	await page.locator('#password').fill('a-strong-password');
	await page.locator('#confirmPassword').fill('a-strong-password');
	await page.getByRole('button', { name: 'Create Admin Account' }).click();
	await expect(page).not.toHaveURL(/\/setup$/);
	// Logged-in session: revisiting /setup now bounces away.
	await page.goto(pristine.baseURL + '/setup');
	await expect(page).not.toHaveURL(/\/setup$/);
});

test('rejects mismatched passwords', async ({ pristine, page }) => {
	await page.goto(pristine.baseURL + '/setup');
	await page.locator('#displayName').fill('First Admin');
	await page.locator('#username').fill('firstadmin');
	await page.locator('#password').fill('a-strong-password');
	await page.locator('#confirmPassword').fill('different-password');
	await page.getByRole('button', { name: 'Create Admin Account' }).click();
	await expect(page).toHaveURL(/\/setup/);
});
