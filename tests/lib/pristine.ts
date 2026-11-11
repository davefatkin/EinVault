import { test as base, expect, type Page } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { createEmptyDb } from './seed';
import { startAppServer, type AppServer } from './app-server';

const REPO_ROOT = path.resolve(import.meta.dirname, '../..');

/** `pristine` boots a per-test server on an empty, migrated database. */
export const test = base.extend<{ pristine: AppServer }>({
	// eslint-disable-next-line no-empty-pattern
	pristine: async ({}, use, testInfo) => {
		const dir = path.join(
			REPO_ROOT,
			'.test-data',
			`pristine-${testInfo.workerIndex}-${testInfo.testId}`
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

export { expect };

/** Runs the setup wizard on a pristine server; the page ends up logged in as the new admin. */
export async function setupAdminAndLogIn(page: Page, server: AppServer): Promise<void> {
	await page.goto(server.baseURL + '/setup');
	await page.locator('#displayName').fill('First Admin');
	await page.locator('#username').fill('firstadmin');
	await page.locator('#password').fill('a-strong-password');
	await page.locator('#confirmPassword').fill('a-strong-password');
	await page.getByRole('button', { name: 'Create Admin Account' }).click();
	await expect(page).not.toHaveURL(/\/setup/, { timeout: 10_000 });
}
