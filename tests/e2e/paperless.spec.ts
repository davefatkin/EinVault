import { test as base, expect, type Page } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { createSeededDb, SEED } from '../lib/seed';
import { startAppServer, type AppServer } from '../lib/app-server';
import { waitForHydration } from '../lib/hydration';
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

test('imports from Paperless on a journal day and says where it was filed', async ({
	world,
	page
}) => {
	world.fake.setDocuments([
		makePaperlessDoc(11, { title: 'Same day scan', tags: [7], created: '2026-05-12T12:00:00Z' }),
		makePaperlessDoc(12, { title: 'Older scan', tags: [7], created: '2026-01-01T00:00:00Z' })
	]);
	await login(page, world.server.baseURL, SEED.member.username);
	const dayUrl = `${world.server.baseURL}/${SEED.companions.ein.id}/journal/2026-05-12`;
	await page.goto(dayUrl);
	await waitForHydration(page);
	const section = page.getByTestId('day-health-records');

	await section.getByRole('button', { name: 'Add', exact: true }).click();
	await page.getByRole('menuitem', { name: /add from paperless/i }).click();
	await page.getByRole('button', { name: /same day scan/i }).click();
	await expect(section.getByText('Same day scan')).toBeVisible({ timeout: 10_000 });

	await section.getByRole('button', { name: 'Add', exact: true }).click();
	await page.getByRole('menuitem', { name: /add from paperless/i }).click();
	await page.getByRole('button', { name: /older scan/i }).click();
	await expect(page.getByText('Imported, filed under 2026-01-01.')).toBeVisible({
		timeout: 10_000
	});
	await expect(page.getByRole('link', { name: 'Open that day' })).toHaveAttribute(
		'href',
		`/${SEED.companions.ein.id}/journal/2026-01-01`
	);
});

test('a supply purchase takes its receipt from Paperless', async ({ world, page }) => {
	world.fake.setDocuments(DOCS);
	const base = world.server.baseURL;
	const ein = SEED.companions.ein.id;
	await login(page, base, SEED.member.username);
	await page.goto(`${base}/${ein}/supplies/new`);
	await waitForHydration(page);
	await page.locator('#supply-name').fill('Paperless tablets');
	await page.locator('#supply-startingQuantity').fill('10');
	await page.getByRole('button', { name: 'Save supply' }).click();
	await expect(page).toHaveURL(/\/supplies\/(?!new$)[^/]+$/, { timeout: 8_000 });
	await waitForHydration(page);

	async function buyWithPaperless(quantity: string, left: string) {
		await page.getByRole('button', { name: 'Log purchase' }).click();
		const purchase = page.getByRole('dialog', { name: 'Log purchase' });
		await purchase.locator('#purchase-quantity').fill(quantity);
		await purchase.getByRole('button', { name: /add from paperless/i }).click();
		const picker = page.getByRole('dialog', { name: /paperless/i });
		await expect(picker.getByRole('button', { name: /vaccination record/i })).toBeVisible({
			timeout: 10_000
		});
		// Escape closes the picker only; the purchase and what was typed stay.
		await page.keyboard.press('Escape');
		await expect(picker).toHaveCount(0);
		await expect(purchase.locator('#purchase-quantity')).toHaveValue(quantity);
		await purchase.getByRole('button', { name: /add from paperless/i }).click();
		await picker.getByRole('button', { name: /vaccination record/i }).click();
		await expect(purchase.getByText('Paperless document 1')).toBeVisible();
		await purchase.getByRole('button', { name: 'Save purchase' }).click();
		await expect(purchase).toHaveCount(0, { timeout: 10_000 });
		await expect(page.getByText(left).first()).toBeVisible();
	}

	await buyWithPaperless('5', '15 left');
	// The same Paperless document again links the receipt already on Ein.
	await buyWithPaperless('5', '20 left');
	const receipts = page.getByRole('region', { name: 'History' }).getByRole('link', {
		name: 'Receipt'
	});
	await expect(receipts).toHaveCount(2);
	const [first, second] = await Promise.all([
		receipts.nth(0).getAttribute('href'),
		receipts.nth(1).getAttribute('href')
	]);
	expect(first).toBe(second);
	expect(first).toMatch(new RegExp(`^/api/documents/${ein}/`));

	await page.goto(base + EIN_DOCS_URL);
	await expect(page.getByText('Receipt: Paperless tablets')).toHaveCount(1);
});

async function addHealthEventWithPaperless(page: Page, title: string) {
	await page.getByRole('button', { name: 'Add Event' }).click();
	const form = page.locator('form[action="?/addHealth"]');
	await form.locator('#title').fill(title);
	await form.getByRole('button', { name: /add from paperless/i }).click();
	const picker = page.getByRole('dialog', { name: /paperless/i });
	await picker.getByRole('button', { name: /vaccination record/i }).click({ timeout: 10_000 });
	await expect(picker).toHaveCount(0);
	await expect(form.getByText('Vaccination record')).toBeVisible();
	await form.getByRole('button', { name: 'Save Event' }).click();
}

test('health event attaches a Paperless document on create', async ({ world, page }) => {
	world.fake.setDocuments(DOCS);
	const title = `e2e-pl-event-${Date.now().toString(36)}`;
	await login(page, world.server.baseURL, SEED.member.username);
	await page.goto(`${world.server.baseURL}/${SEED.companions.ein.id}/health`);
	await waitForHydration(page);

	await addHealthEventWithPaperless(page, title);
	await expect(page.locator('form[action="?/addHealth"]')).toHaveCount(0, { timeout: 10_000 });
	await expect(page.getByRole('button', { name: new RegExp(title) })).toContainText(
		'Vaccination record'
	);
});

test('journal day health event attaches a Paperless document', async ({ world, page }) => {
	world.fake.setDocuments(DOCS);
	const title = `e2e-pl-day-${Date.now().toString(36)}`;
	await login(page, world.server.baseURL, SEED.member.username);
	await page.goto(`${world.server.baseURL}/${SEED.companions.ein.id}/journal/2026-05-14`);
	await waitForHydration(page);
	const section = page.getByTestId('day-health-records');
	await section.getByRole('button', { name: 'Add', exact: true }).click();
	await page.getByRole('menuitem', { name: 'Health event', exact: true }).click();
	const modal = page.getByRole('dialog', { name: 'New Health Event' });
	await modal.locator('#title').fill(title);

	// Escape closes only the picker: the modal and the typed title stay.
	const picker = page.getByRole('dialog', { name: /paperless/i });
	await modal.getByRole('button', { name: /add from paperless/i }).click();
	await expect(picker.getByRole('button', { name: /vaccination record/i })).toBeVisible({
		timeout: 10_000
	});
	await page.keyboard.press('Escape');
	await expect(picker).toHaveCount(0);
	await expect(modal).toBeVisible();
	await expect(modal.locator('#title')).toHaveValue(title);

	await modal.getByRole('button', { name: /add from paperless/i }).click();
	await picker.getByRole('button', { name: /vaccination record/i }).click({ timeout: 10_000 });
	await expect(picker).toHaveCount(0);
	await expect(modal.getByText('Vaccination record')).toBeVisible();
	await modal.getByRole('button', { name: 'Save Event' }).click();
	await expect(modal).toHaveCount(0, { timeout: 10_000 });

	const row = section.getByRole('button', { name: new RegExp(`^${title}`) });
	await expect(row).toContainText('1 attached document');
	await row.click();
	await expect(
		page.getByRole('dialog', { name: title }).getByText('Vaccination record')
	).toBeVisible();
});

test('health event attaches a Paperless document on edit', async ({ world, page }) => {
	world.fake.setDocuments(DOCS);
	const title = `e2e-pl-edit-${Date.now().toString(36)}`;
	await login(page, world.server.baseURL, SEED.member.username);
	await page.goto(`${world.server.baseURL}/${SEED.companions.ein.id}/health`);
	await waitForHydration(page);
	await page.getByRole('button', { name: 'Add Event' }).click();
	await page.locator('#title').fill(title);
	await page.getByRole('button', { name: 'Save Event' }).click();
	const row = page.getByRole('button', { name: new RegExp(title) });
	await row.click({ timeout: 10_000 });
	await page.getByRole('dialog').getByRole('button', { name: 'Edit' }).click();

	const form = page.locator('form[action="?/updateHealth"]');
	await form.getByRole('button', { name: /add from paperless/i }).click();
	const picker = page.getByRole('dialog', { name: /paperless/i });
	await picker.getByRole('button', { name: /vaccination record/i }).click({ timeout: 10_000 });
	await expect(picker).toHaveCount(0);
	await expect(form.getByText('Vaccination record')).toBeVisible();
	await form.getByRole('button', { name: 'Save', exact: true }).click();
	await expect(form).toHaveCount(0, { timeout: 10_000 });
	await expect(row).toContainText('Vaccination record');
});

test('a Paperless document already on another event is refused and stays put', async ({
	world,
	page
}) => {
	world.fake.setDocuments(DOCS);
	const stamp = Date.now().toString(36);
	const first = `e2e-pl-first-${stamp}`;
	const second = `e2e-pl-second-${stamp}`;
	await login(page, world.server.baseURL, SEED.member.username);
	await page.goto(`${world.server.baseURL}/${SEED.companions.ein.id}/health`);
	await waitForHydration(page);

	await addHealthEventWithPaperless(page, first);
	await expect(page.locator('form[action="?/addHealth"]')).toHaveCount(0, { timeout: 10_000 });
	const firstRow = page.getByRole('button', { name: new RegExp(first) });
	await expect(firstRow).toContainText('Vaccination record', { timeout: 10_000 });

	await addHealthEventWithPaperless(page, second);
	await expect(page.getByText(`Already attached to ${first}`)).toBeVisible({ timeout: 10_000 });
	await page.getByRole('button', { name: 'Close', exact: true }).click();

	await expect(firstRow).toContainText('Vaccination record');
	const secondRow = page.getByRole('button', { name: new RegExp(second) });
	await expect(secondRow).toBeVisible();
	await expect(secondRow).not.toContainText('Vaccination record');
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

test('mobile documents header: title and action buttons do not overlap @mobile', async ({
	world,
	page
}, testInfo) => {
	test.skip(testInfo.project.name !== 'mobile', 'mobile only');

	await login(page, world.server.baseURL, SEED.member.username);
	await page.goto(world.server.baseURL + EIN_DOCS_URL);

	const title = page.getByRole('heading', { name: 'Documents', exact: true });
	await expect(title).toBeVisible({ timeout: 10_000 });
	const paperlessButton = page.getByRole('button', { name: /add from paperless/i });
	// The empty state repeats "Upload document" further down; the header button is first.
	const uploadButton = page.getByRole('button', { name: 'Upload document' }).first();
	await expect(paperlessButton).toBeVisible();
	await expect(uploadButton).toBeVisible();

	// ~500px was the worst case: both buttons fit beside a 0%-flex-basis title,
	// which then overflowed its shrunk box and painted over them. The title's
	// bounding box never intersects the buttons (only the ink does), so assert
	// on text overflow as well as box separation.
	for (const width of [393, 500, 620]) {
		await page.setViewportSize({ width, height: 900 });

		const overflows = await title.evaluate((el) => el.scrollWidth > el.clientWidth);
		expect(overflows, `title text must not overflow its box at ${width}px`).toBe(false);

		const titleBox = await title.boundingBox();
		expect(titleBox).toBeTruthy();
		for (const button of [paperlessButton, uploadButton]) {
			const box = await button.boundingBox();
			expect(box).toBeTruthy();
			const separated =
				titleBox!.x + titleBox!.width <= box!.x ||
				box!.x + box!.width <= titleBox!.x ||
				titleBox!.y + titleBox!.height <= box!.y ||
				box!.y + box!.height <= titleBox!.y;
			expect(separated, `header title must not overlap action buttons at ${width}px`).toBe(true);
		}
	}
});

test('caretaker is blocked from the paperless documents API', async ({ world, browser }) => {
	const ctx = await browser.newContext({ baseURL: world.server.baseURL });
	const page = await ctx.newPage();
	await login(page, world.server.baseURL, SEED.caretaker.username);

	const res = await page.request.get(world.server.baseURL + '/api/paperless/documents');
	expect(res.status()).toBe(403);

	await ctx.close();
});
