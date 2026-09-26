import { test, expect } from '../lib/fixtures';

test.describe('i18n', () => {
	test('user pref persists across reload and can be restored', async ({ asMember, app }) => {
		await asMember.goto(app.server.baseURL + '/settings');

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
		await expect(asMember.locator('html')).toHaveAttribute('lang', 'de');
		await expect(asMember.getByRole('heading', { name: 'Sprache' })).toBeVisible();

		// Restore to English — the option label is always 'English' in every locale
		await asMember.locator('select[name="locale"]').selectOption('en');
		await asMember.waitForLoadState('networkidle');
		await expect(asMember.locator('html')).toHaveAttribute('lang', 'en');
	});

	test('dashboard health badges use translated type labels', async ({ asMember, app }) => {
		const COMP = 'seed-comp-ein';
		const title = 'e2e-i18n-vet';

		// Seed health events are weeks old and fall outside Recent Activity; log a fresh one
		await asMember.goto(`${app.server.baseURL}/${COMP}/health`);
		await asMember.getByRole('button', { name: 'Add Event' }).click();
		await asMember.locator('#title').fill(title);
		await asMember.locator('select[name="type"]').selectOption('vet_visit');
		await asMember.getByRole('button', { name: 'Save Event' }).click();
		await expect(asMember.getByText(title)).toBeVisible({ timeout: 8_000 });

		await asMember.goto(app.server.baseURL + '/settings');
		await asMember.locator('select[name="locale"]').selectOption('de');
		await asMember.waitForLoadState('networkidle');
		await expect(asMember.locator('html')).toHaveAttribute('lang', 'de');

		try {
			await asMember.goto(`${app.server.baseURL}/${COMP}`);
			// 'Tierarztbesuch' is enum.healthType.vet_visit in de.ts
			const row = asMember.getByRole('button').filter({ hasText: title });
			await expect(row.getByText('Tierarztbesuch', { exact: true })).toBeVisible();

			await row.click();
			const dialog = asMember.locator('[role="dialog"]');
			await expect(dialog.getByText('Tierarztbesuch', { exact: true })).toBeVisible();
		} finally {
			await asMember.goto(app.server.baseURL + '/settings');
			await asMember.locator('select[name="locale"]').selectOption('en');
			await asMember.waitForLoadState('networkidle');
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
