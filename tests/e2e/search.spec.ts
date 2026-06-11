import { test, expect } from '../lib/fixtures';

const COMP = 'seed-comp-biscuit';

test.describe('global search palette', () => {
	test('shortcut opens palette and seed journal entry navigates on Enter', async ({ asMember }) => {
		await asMember.goto('/');
		// Focus the page body so the window keydown handler receives Control+k
		await asMember.evaluate(() => document.body.focus());

		await asMember.keyboard.press('Control+k');

		const dialog = asMember.locator('[role="dialog"]');
		await expect(dialog).toBeVisible({ timeout: 8_000 });

		await asMember.keyboard.type('Seed journal');

		// Wait for the result option to appear before attempting keyboard navigation
		const firstOption = dialog.locator('[role="option"]').first();
		await expect(firstOption).toBeVisible({ timeout: 8_000 });
		// Result is grouped under the Journal heading.
		await expect(dialog.getByText('Journal', { exact: true })).toBeVisible({ timeout: 8_000 });

		// ArrowDown to select the first result, then Enter to navigate
		await asMember.keyboard.press('ArrowDown');
		await asMember.keyboard.press('Enter');

		await expect(asMember).toHaveURL(`/${COMP}/journal/2026-01-15`, { timeout: 8_000 });
	});

	test('button click opens palette and finds seed health event', async ({ asMember }) => {
		await asMember.goto('/');

		await asMember.getByRole('button', { name: 'Open search' }).click();

		const dialog = asMember.locator('[role="dialog"]');
		await expect(dialog).toBeVisible({ timeout: 8_000 });

		await asMember.keyboard.type('Seed checkup');

		// Wait for the Health group heading to appear
		await expect(asMember.getByText('Health')).toBeVisible({ timeout: 8_000 });

		// The result should be visible
		await expect(dialog.getByText('Seed checkup')).toBeVisible({ timeout: 8_000 });
	});

	test('live roundtrip: newly created health event is searchable', async ({ asMember }) => {
		// Create a health event with a unique title
		await asMember.goto(`/${COMP}/health`);
		await asMember.getByRole('button', { name: 'Add Event' }).click();
		await asMember.locator('#title').fill('e2e-srch-xenolith');
		await asMember.locator('select[name="type"]').selectOption('vet_visit');
		await asMember.getByRole('button', { name: 'Save Event' }).click();
		await expect(asMember.getByText('e2e-srch-xenolith')).toBeVisible({ timeout: 8_000 });

		// Now open the search palette and find the new event
		await asMember.keyboard.press('Control+k');
		const dialog = asMember.locator('[role="dialog"]');
		await expect(dialog).toBeVisible({ timeout: 8_000 });

		await asMember.keyboard.type('xenolith');

		await expect(dialog.getByText('e2e-srch-xenolith')).toBeVisible({ timeout: 8_000 });
	});

	test('caretaker gets 403 on /api/search and has no search button', async ({
		asCaretaker,
		app,
		browser
	}) => {
		// API returns 403 for caretaker
		const res = await asCaretaker.request.get('/api/search?q=seed');
		expect(res.status()).toBe(403);

		// The caretaker layout (/care) must not have an "Open search" button
		await asCaretaker.goto('/care');
		await expect(asCaretaker.getByRole('button', { name: 'Open search' })).toHaveCount(0);
	});

	test('anonymous request to /api/search returns 401', async ({ app, browser }) => {
		const ctx = await browser.newContext({ baseURL: app.server.baseURL });
		const res = await ctx.request.get('/api/search?q=seed');
		expect(res.status()).toBe(401);
		await ctx.close();
	});

	test('keyboard navigation: ArrowDown then Enter navigates to a seed content page', async ({
		asMember
	}) => {
		await asMember.goto('/');
		const startUrl = asMember.url();
		// Focus the page body so the window keydown handler receives Control+k
		await asMember.evaluate(() => document.body.focus());

		await asMember.keyboard.press('Control+k');
		const dialog = asMember.locator('[role="dialog"]');
		await expect(dialog).toBeVisible({ timeout: 8_000 });

		await asMember.keyboard.type('Seed');

		// Wait for results to appear
		await expect(dialog.locator('[role="option"]').first()).toBeVisible({ timeout: 8_000 });

		await asMember.keyboard.press('ArrowDown');
		await asMember.keyboard.press('Enter');

		// URL should have changed away from the start page and into seed-comp-biscuit
		await expect(asMember).not.toHaveURL(startUrl, { timeout: 8_000 });
		await expect(asMember).toHaveURL(new RegExp(`/${COMP}/`), { timeout: 8_000 });
	});
});
