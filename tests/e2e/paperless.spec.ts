import { test as base, expect, type Page } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { createSeededDb, SEED } from '../lib/seed';
import { startAppServer, type AppServer } from '../lib/app-server';
import { startPaperlessFake, makePaperlessDoc, type PaperlessFake } from '../fakes/paperless';

const REPO_ROOT = path.resolve(import.meta.dirname, '../..');

interface PaperlessWorld {
	server: AppServer;
	fake: PaperlessFake;
}

const test = base.extend<{ world: PaperlessWorld }>({
	// eslint-disable-next-line no-empty-pattern
	world: async ({}, use, testInfo) => {
		const dir = path.join(
			REPO_ROOT,
			'.test-data',
			`paperless-${testInfo.workerIndex}-${testInfo.testId}`
		);
		const fake = await startPaperlessFake();
		const dbPath = createSeededDb(dir);
		let server: AppServer;
		try {
			server = await startAppServer({
				dbPath,
				env: {
					PAPERLESS_URL: fake.url,
					PAPERLESS_API_TOKEN: fake.token,
					PAPERLESS_TAG_ID: '7'
				}
			});
		} catch (err) {
			await fake.stop();
			fs.rmSync(dir, { recursive: true, force: true });
			throw err;
		}
		await use({ server, fake });
		await server.stop();
		await fake.stop();
		fs.rmSync(dir, { recursive: true, force: true });
	}
});

async function login(page: Page, baseURL: string, username: string) {
	await page.goto(baseURL + '/auth/login');
	await page.getByLabel('Username').fill(username);
	await page.getByLabel('Password').fill(SEED.password);
	await page.getByRole('button', { name: 'Sign in' }).click();
	await expect(page.getByLabel('Username')).toHaveCount(0, { timeout: 10_000 });
}

const DOCS = [
	makePaperlessDoc(1, { title: 'Vaccination record', tags: [7] }),
	makePaperlessDoc(2, { title: 'Insurance policy', tags: [7] }),
	makePaperlessDoc(3, { title: 'Tax receipt', tags: [9] })
];

const EIN_DOCS_URL = `/${SEED.companions.ein.id}/documents`;

test('picker lists tagged docs and imports one', async ({ world, page }) => {
	world.fake.setDocuments(DOCS);

	await login(page, world.server.baseURL, SEED.member.username);
	await page.goto(world.server.baseURL + EIN_DOCS_URL);

	// Open the picker
	await page.getByRole('button', { name: /add from paperless/i }).click();

	// Tag-scoped docs visible
	await expect(page.getByRole('button', { name: /vaccination record/i })).toBeVisible({
		timeout: 10_000
	});
	await expect(page.getByRole('button', { name: /insurance policy/i })).toBeVisible();

	// Doc with tag 9 must not appear
	await expect(page.getByRole('button', { name: /tax receipt/i })).toHaveCount(0);

	// Import Vaccination record
	await page.getByRole('button', { name: /vaccination record/i }).click();

	// Picker should close and the doc should appear in the list
	await expect(page.getByRole('dialog')).toHaveCount(0, { timeout: 10_000 });
	await expect(page.getByText('Vaccination record')).toBeVisible({ timeout: 10_000 });

	// Verify the document is retrievable via the proxy (bytes start with %PDF)
	const docLink = page.locator('a[href*="/api/documents/"]').first();
	const href = await docLink.getAttribute('href');
	expect(href).toBeTruthy();
	const res = await page.request.get(world.server.baseURL + href!);
	expect(res.status()).toBe(200);
	const body = await res.body();
	expect(body.subarray(0, 4).toString()).toBe('%PDF');
});

test('search filters documents in the picker', async ({ world, page }) => {
	world.fake.setDocuments(DOCS);

	await login(page, world.server.baseURL, SEED.member.username);
	await page.goto(world.server.baseURL + EIN_DOCS_URL);

	await page.getByRole('button', { name: /add from paperless/i }).click();

	// Wait for initial load
	await expect(page.getByRole('button', { name: /vaccination record/i })).toBeVisible({
		timeout: 10_000
	});

	// Type in the search input
	const searchInput = page.getByPlaceholder(/search documents/i);
	await expect(searchInput).toBeVisible();
	await searchInput.fill('insurance');

	// Debounce is 300 ms; wait for the filtered result
	await expect(page.getByRole('button', { name: /insurance policy/i })).toBeVisible({
		timeout: 5_000
	});
	await expect(page.getByRole('button', { name: /vaccination record/i })).toHaveCount(0);
});

test('caretaker is blocked from the paperless documents API', async ({ world, browser }) => {
	const ctx = await browser.newContext({ baseURL: world.server.baseURL });
	const page = await ctx.newPage();
	await login(page, world.server.baseURL, SEED.caretaker.username);

	const res = await page.request.get(world.server.baseURL + '/api/paperless/documents');
	expect(res.status()).toBe(403);

	await ctx.close();
});
