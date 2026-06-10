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
