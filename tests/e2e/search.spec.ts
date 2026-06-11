import { type Page } from '@playwright/test';
import { test, expect } from '../lib/fixtures';

const COMP = 'seed-comp-biscuit';

// Select a sigil filter option. Fills the input with the full sigil token so
// the reactive effect narrows the popup to its first match, then presses Enter
// to commit the selection through the component's own keydown handler (the
// input keeps focus after fill(), so Enter reaches handleKeydown's
// autocomplete-open branch).
async function selectSigilOption(page: Page, fullSigil: string, optionLabel: string) {
	const input = page.locator('input[role="combobox"]');
	await input.fill(fullSigil);
	const sigilPopup = page.locator('#search-sigil-popup');
	await expect(sigilPopup).toBeVisible({ timeout: 8_000 });
	await expect(page.locator('#sigil-option-0')).toContainText(optionLabel, { timeout: 8_000 });
	await input.press('Enter');
	await expect(sigilPopup).toBeHidden({ timeout: 8_000 });
}

test.describe('global search palette', () => {
	test('shortcut opens palette and seed journal entry navigates on Enter', async ({ asMember }) => {
		await asMember.goto('/');
		// The search button rendering proves the layout (and its window keydown
		// handler) has hydrated, so the Ctrl+K below won't race mount.
		await expect(asMember.getByRole('button', { name: 'Open search' })).toBeVisible({
			timeout: 8_000
		});
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

	test('search result for health event deep-links to its detail modal', async ({ asMember }) => {
		await asMember.goto('/');
		await expect(asMember.getByRole('button', { name: 'Open search' })).toBeVisible({
			timeout: 8_000
		});

		await asMember.getByRole('button', { name: 'Open search' }).click();
		const palette = asMember.locator('[role="dialog"]');
		await expect(palette).toBeVisible({ timeout: 8_000 });

		await asMember.keyboard.type('Seed checkup');
		await expect(palette.locator('[role="option"]').first()).toBeVisible({ timeout: 8_000 });

		// Click the result to navigate
		await palette.locator('[role="option"]').first().click();

		// After navigation the palette (a combobox dialog) closes; wait for it to
		// detach so the dialog selector resolves only to the page's detail modal.
		await asMember.waitForURL(new RegExp(`/${COMP}/health`), { timeout: 8_000 });
		await expect(asMember.locator('[role="combobox"]')).toHaveCount(0, { timeout: 8_000 });
		const detailDialog = asMember.locator('[role="dialog"][aria-modal="true"]');
		await expect(detailDialog).toBeVisible({ timeout: 8_000 });
		await expect(detailDialog).toContainText('Seed checkup', { timeout: 8_000 });
	});

	test('search result for reminder deep-links to its detail modal', async ({ asMember }) => {
		await asMember.goto('/');
		await expect(asMember.getByRole('button', { name: 'Open search' })).toBeVisible({
			timeout: 8_000
		});

		await asMember.getByRole('button', { name: 'Open search' }).click();
		const palette = asMember.locator('[role="dialog"]');
		await expect(palette).toBeVisible({ timeout: 8_000 });

		await asMember.keyboard.type('Seed vet visit');
		await expect(palette.locator('[role="option"]').first()).toBeVisible({ timeout: 8_000 });

		// Click the result to navigate
		await palette.locator('[role="option"]').first().click();

		// Wait for the palette (combobox dialog) to detach before resolving the
		// page's detail modal via the shared dialog selector.
		await asMember.waitForURL(new RegExp(`/${COMP}/reminders`), { timeout: 8_000 });
		await expect(asMember.locator('[role="combobox"]')).toHaveCount(0, { timeout: 8_000 });
		const detailDialog = asMember.locator('[role="dialog"][aria-modal="true"]');
		await expect(detailDialog).toBeVisible({ timeout: 8_000 });
		await expect(detailDialog).toContainText('Seed vet visit', { timeout: 8_000 });
	});

	test('media caption deep-links to journal day with lightbox open', async ({ asMember }) => {
		const DATE = '2026-05-10';
		const COMP_ID = COMP;

		// Navigate to the day page and upload a photo.
		await asMember.goto(`/${COMP_ID}/journal/${DATE}`);

		const textarea = asMember.locator('textarea');
		await textarea.fill('e2e lightbox test entry');
		await asMember.locator('h1').first().click();
		await expect(asMember.getByText('✓ Saved')).toBeVisible({ timeout: 8_000 });

		const fileInput = asMember.locator('input[type="file"][name="photos"]').first();
		await fileInput.setInputFiles({
			name: 'photo.png',
			mimeType: 'image/png',
			buffer: Buffer.from(
				'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
				'base64'
			)
		});
		await expect(asMember.locator('img[src*="/api/photos/journal/"]').first()).toBeVisible({
			timeout: 15_000
		});

		// Set the caption with a term that only appears here, not in the journal body.
		await asMember.getByRole('button', { name: 'Edit Caption' }).first().click();
		await asMember.locator('textarea[name="photo-notes"]').first().fill('e2e-cap-zelkova');
		await asMember.getByRole('button', { name: 'Save' }).first().click();
		await expect(asMember.getByText('e2e-cap-zelkova')).toBeVisible({ timeout: 8_000 });

		// Navigate away so the journal page mounts fresh when the search result is clicked.
		await asMember.goto('/');
		await expect(asMember.getByRole('button', { name: 'Open search' })).toBeVisible({
			timeout: 8_000
		});

		// Open search palette and find the caption.
		await asMember.getByRole('button', { name: 'Open search' }).click();
		const palette = asMember.locator('[role="dialog"]');
		await expect(palette).toBeVisible({ timeout: 8_000 });

		await asMember.keyboard.type('zelkova');
		await expect(palette.locator('[role="option"]').first()).toBeVisible({ timeout: 8_000 });

		// Click the media result.
		await palette.locator('[role="option"]').first().click();

		// Wait for navigation to the journal day page and palette to detach.
		await asMember.waitForURL(new RegExp(`/${COMP_ID}/journal/${DATE}`), { timeout: 8_000 });
		await expect(asMember.locator('[role="combobox"]')).toHaveCount(0, { timeout: 8_000 });

		// MediaLightbox should be open.
		const lightbox = asMember.locator('[role="dialog"][aria-modal="true"]');
		await expect(lightbox).toBeVisible({ timeout: 8_000 });
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
		// Open via the button (the Ctrl+K shortcut is covered in the first test;
		// here we exercise in-palette keyboard nav, and the button avoids a race
		// where the key fires before the window handler has hydrated).
		await asMember.getByRole('button', { name: 'Open search' }).click();
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

	// ---- Filter tests ----

	test('#type filter narrows results to health only', async ({ asMember }) => {
		await asMember.goto('/');
		await expect(asMember.getByRole('button', { name: 'Open search' })).toBeVisible({
			timeout: 8_000
		});
		await asMember.getByRole('button', { name: 'Open search' }).click();
		const dialog = asMember.locator('[role="dialog"]');
		await expect(dialog).toBeVisible({ timeout: 8_000 });

		// Select the Health type filter via the sigil popup
		await selectSigilOption(asMember, '#health', 'Health');

		// A Health chip should appear — check on the full page first for debugging
		await expect(asMember.getByRole('button', { name: 'Remove Health filter' })).toBeVisible({
			timeout: 8_000
		});

		// Now search for "Seed"
		await asMember.keyboard.type('Seed');

		// The health result should appear
		await expect(dialog.getByText('Seed checkup')).toBeVisible({ timeout: 8_000 });

		// No Journal group heading should be present in the results list
		await expect(
			dialog.locator('#search-results').getByText('Journal', { exact: true })
		).toHaveCount(0, { timeout: 8_000 });
	});

	test('@companion filter scopes results to Biscuit', async ({ asMember }) => {
		await asMember.goto('/');
		await expect(asMember.getByRole('button', { name: 'Open search' })).toBeVisible({
			timeout: 8_000
		});
		await asMember.getByRole('button', { name: 'Open search' }).click();
		const dialog = asMember.locator('[role="dialog"]');
		await expect(dialog).toBeVisible({ timeout: 8_000 });

		// Select the Biscuit companion filter via the sigil popup
		await selectSigilOption(asMember, '@biscuit', 'Biscuit');

		// Biscuit chip should appear
		const biscuitChip = dialog.getByRole('button', { name: 'Remove Biscuit filter' });
		await expect(biscuitChip).toBeVisible({ timeout: 8_000 });

		// Search for "Seed"
		await asMember.keyboard.type('Seed');

		// A result should appear with Biscuit as companion badge
		await expect(dialog.locator('[role="option"]').first()).toBeVisible({ timeout: 8_000 });
		await expect(dialog.locator('[role="option"]').first()).toContainText('Biscuit');
	});

	test('date after filter excludes then includes Seed checkup', async ({ asMember }) => {
		await asMember.goto('/');
		await expect(asMember.getByRole('button', { name: 'Open search' })).toBeVisible({
			timeout: 8_000
		});
		await asMember.getByRole('button', { name: 'Open search' }).click();
		const dialog = asMember.locator('[role="dialog"]');
		await expect(dialog).toBeVisible({ timeout: 8_000 });

		// Select #health filter via keyboard
		await selectSigilOption(asMember, '#health', 'Health');
		await expect(dialog.getByRole('button', { name: 'Remove Health filter' })).toBeVisible({
			timeout: 8_000
		});

		// With no text, filter-only browse shows Seed checkup
		await expect(dialog.getByText('Seed checkup')).toBeVisible({ timeout: 8_000 });

		// Set after date past the health event date — it should disappear
		await asMember.fill('input[name="after"]', '2026-03-02');
		await expect(dialog.getByText('Seed checkup')).toBeHidden({ timeout: 8_000 });

		// Clear the after filter — Seed checkup should reappear
		await asMember.fill('input[name="after"]', '');
		await expect(dialog.getByText('Seed checkup')).toBeVisible({ timeout: 8_000 });
	});

	test('filter-only browse: #reminder shows Seed vet visit', async ({ asMember }) => {
		await asMember.goto('/');
		await expect(asMember.getByRole('button', { name: 'Open search' })).toBeVisible({
			timeout: 8_000
		});
		await asMember.getByRole('button', { name: 'Open search' }).click();
		const dialog = asMember.locator('[role="dialog"]');
		await expect(dialog).toBeVisible({ timeout: 8_000 });

		// Select the Reminders type filter via the sigil popup
		await selectSigilOption(asMember, '#reminder', 'Reminders');

		// With no text, browse shows Seed vet visit under Reminders group.
		// Scope the group-heading check to the results listbox so it doesn't
		// also match the "Reminders" filter chip (same localized label).
		await expect(dialog.getByText('Seed vet visit')).toBeVisible({ timeout: 8_000 });
		await expect(
			dialog.locator('#search-results').getByText('Reminders', { exact: true })
		).toBeVisible({ timeout: 8_000 });
	});

	test('combined #health + @biscuit filter shows Seed checkup', async ({ asMember }) => {
		await asMember.goto('/');
		await expect(asMember.getByRole('button', { name: 'Open search' })).toBeVisible({
			timeout: 8_000
		});
		await asMember.getByRole('button', { name: 'Open search' }).click();
		const dialog = asMember.locator('[role="dialog"]');
		await expect(dialog).toBeVisible({ timeout: 8_000 });

		// Select #health filter via keyboard
		await selectSigilOption(asMember, '#health', 'Health');
		await expect(dialog.getByRole('button', { name: 'Remove Health filter' })).toBeVisible({
			timeout: 8_000
		});

		// Select @biscuit companion filter via keyboard
		await selectSigilOption(asMember, '@biscuit', 'Biscuit');
		await expect(dialog.getByRole('button', { name: 'Remove Biscuit filter' })).toBeVisible({
			timeout: 8_000
		});

		// Type "Seed" — health result for Biscuit should appear
		await asMember.keyboard.type('Seed');
		await expect(dialog.getByText('Seed checkup')).toBeVisible({ timeout: 8_000 });
		// Companion badge should say Biscuit
		await expect(dialog.locator('[role="option"]').first()).toContainText('Biscuit');
	});

	test('removing health chip broadens results to include journal', async ({ asMember }) => {
		await asMember.goto('/');
		await expect(asMember.getByRole('button', { name: 'Open search' })).toBeVisible({
			timeout: 8_000
		});
		await asMember.getByRole('button', { name: 'Open search' }).click();
		const dialog = asMember.locator('[role="dialog"]');
		await expect(dialog).toBeVisible({ timeout: 8_000 });

		// Select #health filter via keyboard
		await selectSigilOption(asMember, '#health', 'Health');
		await expect(dialog.getByRole('button', { name: 'Remove Health filter' })).toBeVisible({
			timeout: 8_000
		});

		// Search "Seed" — with health filter, only health results visible; no Journal group
		await asMember.keyboard.type('Seed');
		await expect(dialog.getByText('Seed checkup')).toBeVisible({ timeout: 8_000 });
		await expect(
			dialog.locator('#search-results').getByText('Journal', { exact: true })
		).toHaveCount(0, { timeout: 8_000 });

		// Remove the Health chip
		await dialog.getByRole('button', { name: 'Remove Health filter' }).click();

		// Journal group should now appear in the results list (seed 'Seed journal entry')
		await expect(
			dialog.locator('#search-results').getByText('Journal', { exact: true })
		).toBeVisible({ timeout: 8_000 });
	});

	test('caretaker gets 403 on /api/search with type filter', async ({ asCaretaker }) => {
		const res = await asCaretaker.request.get('/api/search?q=seed&type=health');
		expect(res.status()).toBe(403);
	});
});
