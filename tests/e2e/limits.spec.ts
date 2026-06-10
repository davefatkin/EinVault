import { test as base, expect, type Page } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { createSeededDb, SEED } from '../lib/seed';
import { startAppServer, type AppServer } from '../lib/app-server';
import { PNG_BYTES } from '../lib/files';

const REPO_ROOT = path.resolve(import.meta.dirname, '../..');
const COMP = SEED.companions.biscuit.id;

interface LimitsWorld {
	server: AppServer;
}

const test = base.extend<{ world: LimitsWorld }>({
	// eslint-disable-next-line no-empty-pattern
	world: async ({}, use, testInfo) => {
		const dir = path.join(
			REPO_ROOT,
			'.test-data',
			`limits-${testInfo.workerIndex}-${testInfo.testId}`
		);
		const dbPath = createSeededDb(dir);
		let server: AppServer;
		try {
			server = await startAppServer({
				dbPath,
				env: {
					UPLOAD_MAX_MB: '1',
					MAX_DAILY_MEDIA: '2'
				}
			});
		} catch (err) {
			fs.rmSync(dir, { recursive: true, force: true });
			throw err;
		}
		await use({ server });
		await server.stop();
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

async function apiUploadPhoto(
	page: Page,
	baseURL: string,
	comp: string,
	date: string,
	photoBuffer: Buffer,
	name = 'photo.png'
) {
	return page.request.post(`${baseURL}/api/companions/${comp}/journal/${date}/photos`, {
		headers: { Origin: baseURL },
		multipart: {
			photo: {
				name,
				mimeType: 'image/png',
				buffer: photoBuffer
			}
		}
	});
}

test('oversized upload is rejected with fileTooLarge', async ({ world, page }) => {
	await login(page, world.server.baseURL, SEED.member.username);

	// Build a buffer just over 1 MB that starts with valid PNG magic bytes.
	// The handler checks file.size > MAX_IMAGE_SIZE (1 * 1024 * 1024) before
	// calling sharp, so this returns 400 with the fileTooLarge message.
	const oversized = Buffer.concat([PNG_BYTES, Buffer.alloc(1_300_000)]);

	const res = await apiUploadPhoto(page, world.server.baseURL, COMP, '2026-06-10', oversized);
	expect(res.status()).toBe(400);
	const body = await res.text();
	expect(body).toContain('File too large');
});

test('daily media cap rejects the third upload', async ({ world, page }) => {
	await login(page, world.server.baseURL, SEED.member.username);

	const date = '2026-06-11';
	const photoData = PNG_BYTES;

	// First two uploads must succeed
	const first = await apiUploadPhoto(page, world.server.baseURL, COMP, date, photoData);
	expect(first.status()).toBe(200);

	const second = await apiUploadPhoto(page, world.server.baseURL, COMP, date, photoData);
	expect(second.status()).toBe(200);

	// Third upload must be rejected
	const third = await apiUploadPhoto(page, world.server.baseURL, COMP, date, photoData);
	expect(third.status()).toBe(400);
	const body = await third.text();
	expect(body).toContain('Maximum 2 photos or videos per day');

	// Verify the entry still shows exactly 2 photos
	const listRes = await page.request.get(
		`${world.server.baseURL}/api/companions/${COMP}/journal/${date}/photos`
	);
	expect(listRes.status()).toBe(200);
	const data = await listRes.json();
	expect(data.photos).toHaveLength(2);
});
