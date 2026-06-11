import { test as base, expect, type Page } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { createSeededDb, SEED } from '../lib/seed';
import { startAppServer, type AppServer } from '../lib/app-server';
import { startS3Fake, type S3Fake } from '../fakes/s3';
import { pngUpload } from '../lib/files';

const REPO_ROOT = path.resolve(import.meta.dirname, '../..');
const COMP = SEED.companions.biscuit.id;

interface S3World {
	server: AppServer;
	s3: S3Fake;
}

const test = base.extend<{ world: S3World }>({
	// eslint-disable-next-line no-empty-pattern
	world: async ({}, use, testInfo) => {
		const dir = path.join(REPO_ROOT, '.test-data', `s3-${testInfo.workerIndex}-${testInfo.testId}`);
		const fake = await startS3Fake();
		const dbPath = createSeededDb(dir);
		let server: AppServer;
		try {
			server = await startAppServer({
				dbPath,
				env: {
					STORAGE_BACKEND: 's3',
					S3_ENDPOINT: fake.url,
					S3_BUCKET: 'einvault-test',
					S3_REGION: 'auto',
					S3_ACCESS_KEY_ID: 'test',
					S3_SECRET_ACCESS_KEY: 'test',
					S3_FORCE_PATH_STYLE: 'true',
					S3_PRESIGN_TTL_SECONDS: '300'
				}
			});
		} catch (err) {
			await fake.stop();
			fs.rmSync(dir, { recursive: true, force: true });
			throw err;
		}
		await use({ server, s3: fake });
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

async function uploadPhoto(page: Page, baseURL: string) {
	await login(page, baseURL, SEED.member.username);
	await page.goto(baseURL + `/${COMP}/journal/2026-06-02`);
	const fileInput = page.locator('input[type="file"][name="photos"]').first();
	await fileInput.setInputFiles(pngUpload());
	const img = page.locator('img[src*="/api/photos/journal/"]').first();
	await expect(img).toBeVisible({ timeout: 15_000 });
	// A broken 302 still leaves a visible-but-empty <img>; naturalWidth > 0
	// proves the browser followed the presign redirect and decoded real bytes.
	await expect
		.poll(() => img.evaluate((el: HTMLImageElement) => el.naturalWidth), { timeout: 15_000 })
		.toBeGreaterThan(0);
}

test('upload lands in the bucket', async ({ world, page }) => {
	await uploadPhoto(page, world.server.baseURL);
	expect(world.s3.objects.size).toBeGreaterThan(0);
});

test('photo GET 302s to a presigned fake URL', async ({ world, page }) => {
	await uploadPhoto(page, world.server.baseURL);

	const src = await page.locator('img[src*="/api/photos/journal/"]').first().getAttribute('src');
	expect(src).toBeTruthy();

	// Request the /api/photos/... URL without following redirects
	const res = await page.request.get(world.server.baseURL + src!, { maxRedirects: 0 });
	expect(res.status()).toBe(302);

	const location = res.headers()['location'] ?? '';
	expect(location).toContain(world.s3.url);
	expect(location).toContain('X-Amz-');
});

test('delete removes from bucket', async ({ world, page }) => {
	await uploadPhoto(page, world.server.baseURL);

	const sizeBefore = world.s3.objects.size;
	expect(sizeBefore).toBeGreaterThan(0);

	// Hover the photo container to reveal the delete button
	const photoContainer = page
		.locator('div.group')
		.filter({ has: page.locator('img[src*="/api/photos/journal/"]') })
		.first();
	await photoContainer.hover();

	// The thumbnail is itself a button (opens the lightbox), so scope to the
	// delete control by its accessible name rather than "any aria-labelled button".
	const deleteBtn = photoContainer.getByRole('button', { name: 'Delete media' });
	await deleteBtn.click();

	// Confirm in the dialog
	const confirmDialog = page.locator('[role="dialog"]');
	await confirmDialog.getByRole('button', { name: 'Delete' }).click();

	// Photo removed from UI
	await expect(page.locator('img[src*="/api/photos/journal/"]')).toHaveCount(0, {
		timeout: 5_000
	});

	// Bucket objects should decrease
	await expect.poll(() => world.s3.objects.size, { timeout: 5_000 }).toBeLessThan(sizeBefore);
});
