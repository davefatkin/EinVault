import { test as base, expect, type Page } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { createSeededDb, SEED } from '../lib/seed';
import { startAppServer, type AppServer } from '../lib/app-server';
import { startImmichFake, makeImmichAsset, type ImmichFake } from '../fakes/immich';

const REPO_ROOT = path.resolve(import.meta.dirname, '../..');

interface ImmichWorld {
	server: AppServer;
	fake: ImmichFake;
}

const test = base.extend<{ world: ImmichWorld }>({
	// eslint-disable-next-line no-empty-pattern
	world: async ({}, use, testInfo) => {
		const dir = path.join(
			REPO_ROOT,
			'.test-data',
			`immich-${testInfo.workerIndex}-${testInfo.testId}`
		);
		const fake = await startImmichFake();
		const dbPath = createSeededDb(dir);
		let server: AppServer;
		try {
			server = await startAppServer({
				dbPath,
				env: {
					IMMICH_URL: fake.url,
					IMMICH_API_KEY: fake.apiKey
					// No IMMICH_ALBUM_ID → recent-assets (search/metadata) path
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

// Asset IDs must be valid UUIDs — the server validates with IMMICH_ASSET_ID_RE.
const ASSET_ID_1 = '00000000-0000-0000-0000-000000000001';
const ASSET_ID_2 = '00000000-0000-0000-0000-000000000002';
const ASSET_ID_3 = '00000000-0000-0000-0000-000000000003';

const ASSETS = [
	makeImmichAsset(ASSET_ID_1),
	makeImmichAsset(ASSET_ID_2),
	makeImmichAsset(ASSET_ID_3)
];

const BISCUIT_ID = SEED.companions.biscuit.id;

test('avatar from Immich', async ({ world, page }) => {
	world.fake.setAssets(ASSETS);

	await login(page, world.server.baseURL, SEED.member.username);
	await page.goto(world.server.baseURL + `/companions/${BISCUIT_ID}/edit`);

	// The editable companion avatar lives on the edit form. Its Immich button
	// has aria-label="Pick from Immich" and sits next to the file-upload button.
	await page
		.getByRole('button', { name: /pick from immich/i })
		.first()
		.click();

	// Picker opens (dialog role) and thumbnails load via /api/immich/thumbnail/
	const dialog = page.getByRole('dialog');
	await expect(dialog).toBeVisible({ timeout: 10_000 });

	// Wait for at least one thumbnail image inside the picker
	const thumbnail = dialog.locator(`img[src*="/api/immich/thumbnail/${ASSET_ID_1}"]`);
	await expect(thumbnail).toBeVisible({ timeout: 10_000 });

	// Pick asset 1 — buttons have title={asset.originalFileName} which is "<id>.png"
	await dialog.locator(`button[title="${ASSET_ID_1}.png"]`).click();

	// Picker should close after a successful pick
	await expect(dialog).toHaveCount(0, { timeout: 10_000 });

	// Avatar endpoint must now return an image
	const avatarRes = await page.request.get(world.server.baseURL + `/api/avatars/${BISCUIT_ID}`);
	expect(avatarRes.status()).toBe(200);
	const ct = avatarRes.headers()['content-type'] ?? '';
	expect(ct).toMatch(/^image\//);
});

test('journal photo from Immich', async ({ world, page }) => {
	world.fake.setAssets(ASSETS);

	await login(page, world.server.baseURL, SEED.member.username);
	await page.goto(world.server.baseURL + `/${BISCUIT_ID}/journal/2026-06-01`);

	// The "Pick from Immich" button is in the Photos section header
	await page.getByRole('button', { name: /pick from immich/i }).click();

	const dialog = page.getByRole('dialog');
	await expect(dialog).toBeVisible({ timeout: 10_000 });

	// Wait for asset 2 thumbnail
	const thumbnail = dialog.locator(`img[src*="/api/immich/thumbnail/${ASSET_ID_2}"]`);
	await expect(thumbnail).toBeVisible({ timeout: 10_000 });

	// Pick asset 2
	await dialog.locator(`button[title="${ASSET_ID_2}.png"]`).click();

	// Picker closes
	await expect(dialog).toHaveCount(0, { timeout: 10_000 });

	// A photo thumbnail served via /api/photos/ should appear in the entry
	const photoImg = page.locator('img[src*="/api/photos/journal/"]');
	await expect(photoImg).toBeVisible({ timeout: 10_000 });

	// Reload and verify persistence
	await page.reload();
	const photoImgAfterReload = page.locator('img[src*="/api/photos/journal/"]');
	await expect(photoImgAfterReload).toBeVisible({ timeout: 10_000 });
});

test('caretaker is blocked from the Immich assets API', async ({ world, browser }) => {
	const ctx = await browser.newContext({ baseURL: world.server.baseURL });
	const page = await ctx.newPage();
	await login(page, world.server.baseURL, SEED.caretaker.username);

	const res = await page.request.get(world.server.baseURL + '/api/immich/assets');
	expect(res.status()).toBe(403);

	await ctx.close();
});
