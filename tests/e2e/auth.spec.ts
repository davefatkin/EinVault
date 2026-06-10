import { test, expect } from '../lib/fixtures';
import { SEED } from '../lib/seed';

test.describe('login @mobile', () => {
	test('valid credentials reach the app', async ({ app, page }) => {
		await page.goto(app.server.baseURL + '/auth/login');
		await page.getByLabel('Username').fill(SEED.member.username);
		await page.getByLabel('Password').fill(SEED.password);
		await page.getByRole('button', { name: 'Sign in' }).click();
		await expect(page).not.toHaveURL(/auth\/login/);
	});

	test('bad password stays on login with an error', async ({ app, page }) => {
		await page.goto(app.server.baseURL + '/auth/login');
		await page.getByLabel('Username').fill(SEED.member.username);
		await page.getByLabel('Password').fill('wrong-password');
		await page.getByRole('button', { name: 'Sign in' }).click();
		await expect(page).toHaveURL(/auth\/login/);
	});

	test('caretaker is redirected to /care', async ({ asCaretaker }) => {
		await asCaretaker.goto('/');
		await expect(asCaretaker).toHaveURL(/\/care/);
	});

	test('unauthenticated visit to app routes bounces to login', async ({ app, browser }) => {
		const ctx = await browser.newContext({ baseURL: app.server.baseURL });
		const page = await ctx.newPage();
		await page.goto('/companions');
		await expect(page).toHaveURL(/auth\/login/);
		await ctx.close();
	});
});

test.describe('access control', () => {
	test('member gets 403 on admin route', async ({ asMember }) => {
		const res = await asMember.goto('/admin/users');
		expect(res!.status()).toBe(403);
	});

	test('admin reaches admin route', async ({ asAdmin }) => {
		const res = await asAdmin.goto('/admin/users');
		expect(res!.status()).toBe(200);
	});
});

test.describe('forgot password', () => {
	test('reset link arrives by mail and resets the password', async ({ app, browser }) => {
		// Seed rows are read-only for cached-state roles; resetUser exists solely
		// for this destructive flow.
		const ctx = await browser.newContext({ baseURL: app.server.baseURL });
		const page = await ctx.newPage();

		await page.goto('/auth/forgot');
		await page.getByLabel('Email').fill('seed-reset@example.com');
		await page.getByRole('button', { name: 'Send reset link' }).click();

		const mail = await app.smtp.waitForMail((m) =>
			(m.to?.text ?? '').includes('seed-reset@example.com')
		);
		const link = (mail.text ?? '').match(/https?:\/\/\S+/)?.[0];
		expect(link).toBeTruthy();

		await page.goto(link!);
		await page.locator('#newPassword').fill('brand-new-password-1');
		await page.locator('#confirmPassword').fill('brand-new-password-1');
		await page.getByRole('button', { name: 'Set new password' }).click();

		// New password works.
		await page.goto('/auth/login');
		await page.getByLabel('Username').fill(SEED.resetUser.username);
		await page.getByLabel('Password').fill('brand-new-password-1');
		await page.getByRole('button', { name: 'Sign in' }).click();
		await expect(page).not.toHaveURL(/auth\/login/);
		await ctx.close();
	});
});
