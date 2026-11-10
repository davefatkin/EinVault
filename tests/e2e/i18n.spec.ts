import { test, expect } from '../lib/fixtures';
import { waitForHydration } from '../lib/hydration';
import { createCompanionViaUi, deleteCompanionByName } from '../lib/companions';

test.describe('i18n', () => {
	test('user pref persists across reload and can be restored', async ({ asMember, app }) => {
		await asMember.goto(app.server.baseURL + '/settings');
		await waitForHydration(asMember);

		// Switch to German
		await asMember.locator('select[name="locale"]').selectOption('de');
		// The enhance callback calls window.location.reload() after submit
		await asMember.waitForLoadState('networkidle');

		// German settings page visible
		await expect(asMember.locator('html')).toHaveAttribute('lang', 'de');
		// 'Sprache' is page.settings.languageCard in de.ts
		await expect(asMember.getByRole('heading', { name: 'Sprache' })).toBeVisible();

		// Preference persists after reload
		await asMember.reload();
		await waitForHydration(asMember);
		await expect(asMember.locator('html')).toHaveAttribute('lang', 'de');
		await expect(asMember.getByRole('heading', { name: 'Sprache' })).toBeVisible();

		// Restore to English — the option label is always 'English' in every locale
		await asMember.locator('select[name="locale"]').selectOption('en');
		await asMember.waitForLoadState('networkidle');
		await expect(asMember.locator('html')).toHaveAttribute('lang', 'en');
	});

	test('dashboard health badges use translated type labels', async ({ asMember, app }) => {
		const title = 'e2e-i18n-vet';
		// A fresh companion: the dashboard timeline shows only the newest 8 items,
		// and the event's minute-precision time lands behind anything other specs
		// in this worker logged on a seeded companion within the same minute.
		const petName = `e2e-i18n-${Date.now()}`;

		try {
			const comp = await createCompanionViaUi(asMember, petName);
			await asMember.goto(`${app.server.baseURL}/${comp}/health`);
			await waitForHydration(asMember);
			await asMember.getByRole('button', { name: 'Add Event' }).click();
			await asMember.locator('#title').fill(title);
			await asMember.locator('select[name="type"]').selectOption('vet_visit');
			await asMember.getByRole('button', { name: 'Save Event' }).click();
			await expect(asMember.getByText(title)).toBeVisible({ timeout: 8_000 });

			await asMember.goto(app.server.baseURL + '/settings');
			await waitForHydration(asMember);
			await asMember.locator('select[name="locale"]').selectOption('de');
			await asMember.waitForLoadState('networkidle');
			await expect(asMember.locator('html')).toHaveAttribute('lang', 'de');

			await asMember.goto(`${app.server.baseURL}/${comp}`);
			await waitForHydration(asMember);
			// 'Tierarztbesuch' is enum.healthType.vet_visit in de.ts
			const row = asMember.getByRole('button').filter({ hasText: title });
			await expect(row.getByText('Tierarztbesuch', { exact: true })).toBeVisible();

			await row.click();
			const dialog = asMember.locator('[role="dialog"]');
			await expect(dialog.getByText('Tierarztbesuch', { exact: true })).toBeVisible();
		} finally {
			deleteCompanionByName(app.dataDir, petName);
			await asMember.goto(app.server.baseURL + '/settings');
			await waitForHydration(asMember);
			await asMember.locator('select[name="locale"]').selectOption('en');
			await asMember.waitForLoadState('networkidle');
			// Wait for the save to land: the member's locale is shared by every
			// later spec in this worker.
			await expect(asMember.locator('html')).toHaveAttribute('lang', 'en');
		}
	});

	test('einvault_locale cookie drives language on anonymous pages', async ({ app, browser }) => {
		const ctx = await browser.newContext({ baseURL: app.server.baseURL });
		await ctx.addCookies([{ name: 'einvault_locale', value: 'de', url: app.server.baseURL }]);
		const page = await ctx.newPage();
		await page.goto('/auth/login');

		// 'Anmelden' is page.login.signIn in de.ts (the submit button)
		await expect(page.getByRole('button', { name: 'Anmelden' })).toBeVisible();
		await expect(page.locator('html')).toHaveAttribute('lang', 'de');

		await ctx.close();
	});

	test('Accept-Language header falls back to matching locale', async ({ app, browser }) => {
		// Playwright's locale option sets the browser Accept-Language header.
		// extraHTTPHeaders cannot override browser-generated headers in Chromium.
		const ctx = await browser.newContext({
			baseURL: app.server.baseURL,
			locale: 'fr-FR'
		});
		const page = await ctx.newPage();
		await page.goto('/auth/login');

		// 'Se connecter' is page.login.signIn in fr.ts (the submit button)
		await expect(page.getByRole('button', { name: 'Se connecter' })).toBeVisible();
		await expect(page.locator('html')).toHaveAttribute('lang', 'fr');

		await ctx.close();
	});
});
