import { test as base, expect } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { createSeededDb, SEED } from '../lib/seed';
import { startAppServer, type AppServer } from '../lib/app-server';
import { getFreePort } from '../lib/ports';

const REPO_ROOT = path.resolve(import.meta.dirname, '../..');

// Boots a dedicated server with CALENDAR_FEED_ENABLED=false so we can assert the
// kill switch hides the UI and refuses the endpoint. Env-variant servers can't
// use the shared cached storageState, so we log in via the form.
const test = base.extend<{ server: AppServer }>({
	// eslint-disable-next-line no-empty-pattern
	server: async ({}, use, testInfo) => {
		const dir = path.join(
			REPO_ROOT,
			'.test-data',
			`calfeed-off-${testInfo.workerIndex}-${testInfo.testId}`
		);
		const port = await getFreePort();
		const dbPath = createSeededDb(dir);
		const server = await startAppServer({
			dbPath,
			env: { PORT: String(port), CALENDAR_FEED_ENABLED: 'false' }
		});
		await use(server);
		await server.stop();
		fs.rmSync(dir, { recursive: true, force: true });
	}
});

test('CALENDAR_FEED_ENABLED=false hides the settings card and 404s the feed', async ({
	server,
	page
}) => {
	await page.goto(server.baseURL + '/auth/login');
	await page.getByLabel('Username').fill(SEED.member.username);
	await page.getByLabel('Password').fill(SEED.password);
	await page.getByRole('button', { name: 'Sign in' }).click();
	await expect(page).not.toHaveURL(/auth\/login/, { timeout: 8_000 });

	await page.goto(server.baseURL + '/settings');
	// The account card proves the settings page rendered; the calendar card must not.
	await expect(page.getByText('Calendar Feed', { exact: true })).toHaveCount(0, { timeout: 8_000 });

	// The endpoint itself 404s regardless of token while disabled.
	const res = await page.request.get(server.baseURL + '/api/calendar/any-token/feed.ics');
	expect(res.status()).toBe(404);
});
