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
		let server: AppServer;
		try {
			server = await startAppServer({ dbPath });
		} catch (err) {
			fs.rmSync(dir, { recursive: true, force: true });
			throw err;
		}
		await use(server);
		await server.stop();
		fs.rmSync(dir, { recursive: true, force: true });
	}
});

test('dashboard shows the first-run welcome at zero companions', async ({ pristine, page }) => {
	await page.goto(pristine.baseURL + '/setup');
	await page.locator('#displayName').fill('First Admin');
	await page.locator('#username').fill('firstadmin');
	await page.locator('#password').fill('a-strong-password');
	await page.locator('#confirmPassword').fill('a-strong-password');
	await page.getByRole('button', { name: 'Create Admin Account' }).click();
	// After setup the admin is logged in; navigate to / (0 companions, no redirect).
	await page.goto(pristine.baseURL + '/');
	await expect(page.getByText('Welcome to EinVault')).toBeVisible({ timeout: 10_000 });
	await expect(
		page.getByRole('link', { name: 'Add your first companion', exact: true })
	).toBeVisible();
	await expect(page.getByTestId('ein')).toBeVisible();
	await expect(page.getByTestId('ein')).toHaveAttribute('data-pose', 'welcome');
});
