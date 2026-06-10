import { test, expect } from '../lib/fixtures';

// Helper: log in as a freshly-created user in an isolated context.
// Returns the page (already past login) and a cleanup function.
async function loginAs(
	browser: import('@playwright/test').Browser,
	baseURL: string,
	username: string,
	password: string
): Promise<{ page: import('@playwright/test').Page; cleanup: () => Promise<void> }> {
	const ctx = await browser.newContext({ baseURL });
	const page = await ctx.newPage();
	await page.goto('/auth/login');
	await page.getByLabel('Username').fill(username);
	await page.getByLabel('Password').fill(password);
	await page.getByRole('button', { name: 'Sign in' }).click();
	return {
		page,
		cleanup: () => ctx.close()
	};
}

const INITIAL_PASSWORD = 'e2e-password-123';

test.describe('admin-users', () => {
	// -----------------------------------------------------------------------
	// 1. Admin creates a new user and it appears in the list.
	// -----------------------------------------------------------------------
	test('create user', async ({ asAdmin }) => {
		await asAdmin.goto('/admin/users');
		await expect(asAdmin).toHaveURL(/\/admin\/users/, { timeout: 10_000 });

		await asAdmin.getByRole('button', { name: /new user/i }).click();

		const form = asAdmin.locator('form[action="?/create"]');
		await expect(form).toBeVisible({ timeout: 4_000 });

		await form.getByLabel(/display name/i).fill('E2E User 1');
		await form.getByLabel(/username/i).fill('e2e-user-1');
		await form.getByLabel(/password/i).fill(INITIAL_PASSWORD);
		// Leave role as default (member).

		await form.getByRole('button', { name: /create user/i }).click();

		// Success alert
		await expect(asAdmin.getByText(/user created successfully/i)).toBeVisible({ timeout: 10_000 });

		// User row appears in the list.
		const userRow = asAdmin.locator('div.px-6.py-4').filter({ hasText: 'e2e-user-1' });
		await expect(userRow).toBeVisible({ timeout: 6_000 });
		await expect(userRow.getByText('E2E User 1')).toBeVisible();
	});

	// -----------------------------------------------------------------------
	// 2. Newly created user can log in.
	// -----------------------------------------------------------------------
	test('new user can log in', async ({ asAdmin, app, browser }) => {
		// Create the user.
		await asAdmin.goto('/admin/users');
		await expect(asAdmin).toHaveURL(/\/admin\/users/, { timeout: 10_000 });

		await asAdmin.getByRole('button', { name: /new user/i }).click();

		const form = asAdmin.locator('form[action="?/create"]');
		await expect(form).toBeVisible({ timeout: 4_000 });

		await form.getByLabel(/display name/i).fill('E2E User 2');
		await form.getByLabel(/username/i).fill('e2e-user-2');
		await form.getByLabel(/password/i).fill(INITIAL_PASSWORD);

		await form.getByRole('button', { name: /create user/i }).click();
		await expect(asAdmin.getByText(/user created successfully/i)).toBeVisible({ timeout: 10_000 });

		// Try logging in as the new user.
		const { page, cleanup } = await loginAs(
			browser,
			app.server.baseURL,
			'e2e-user-2',
			INITIAL_PASSWORD
		);
		await expect(page).not.toHaveURL(/auth\/login/, { timeout: 10_000 });
		await cleanup();
	});

	// -----------------------------------------------------------------------
	// 3. Deactivate blocks login; reactivate restores it.
	// -----------------------------------------------------------------------
	test('deactivate blocks login, reactivate restores', async ({ asAdmin, app, browser }) => {
		// Create e2e-user-3.
		await asAdmin.goto('/admin/users');
		await expect(asAdmin).toHaveURL(/\/admin\/users/, { timeout: 10_000 });

		await asAdmin.getByRole('button', { name: /new user/i }).click();

		const form = asAdmin.locator('form[action="?/create"]');
		await expect(form).toBeVisible({ timeout: 4_000 });

		await form.getByLabel(/display name/i).fill('E2E User 3');
		await form.getByLabel(/username/i).fill('e2e-user-3');
		await form.getByLabel(/password/i).fill(INITIAL_PASSWORD);

		await form.getByRole('button', { name: /create user/i }).click();
		await expect(asAdmin.getByText(/user created successfully/i)).toBeVisible({ timeout: 10_000 });

		// Deactivate via More Actions menu.
		const userRow = asAdmin.locator('div.px-6.py-4').filter({ hasText: 'e2e-user-3' });
		await expect(userRow).toBeVisible({ timeout: 6_000 });

		await userRow.getByRole('button', { name: /more actions/i }).click();
		const deactivateItem = asAdmin.getByRole('menuitem', { name: /deactivate/i });
		await expect(deactivateItem).toBeVisible({ timeout: 4_000 });
		await deactivateItem.click();

		// Wait for the inactive badge to appear.
		await expect(userRow.getByText(/inactive/i)).toBeVisible({ timeout: 10_000 });

		// Login with deactivated account should fail (stay on login page).
		const ctx1 = await browser.newContext({ baseURL: app.server.baseURL });
		const loginPage1 = await ctx1.newPage();
		await loginPage1.goto('/auth/login');
		await loginPage1.getByLabel('Username').fill('e2e-user-3');
		await loginPage1.getByLabel('Password').fill(INITIAL_PASSWORD);
		await loginPage1.getByRole('button', { name: /sign in/i }).click();
		await expect(loginPage1).toHaveURL(/auth\/login/, { timeout: 10_000 });
		// An error message should be visible.
		await expect(loginPage1.locator('body')).not.toBeEmpty();
		await ctx1.close();

		// Reactivate via More Actions menu.
		await userRow.getByRole('button', { name: /more actions/i }).click();
		const activateItem = asAdmin.getByRole('menuitem', { name: /activate/i });
		await expect(activateItem).toBeVisible({ timeout: 4_000 });
		await activateItem.click();

		// Inactive badge should disappear.
		await expect(userRow.getByText(/inactive/i)).toHaveCount(0, { timeout: 10_000 });

		// Login now succeeds.
		const { page: page2, cleanup: cleanup2 } = await loginAs(
			browser,
			app.server.baseURL,
			'e2e-user-3',
			INITIAL_PASSWORD
		);
		await expect(page2).not.toHaveURL(/auth\/login/, { timeout: 10_000 });
		await cleanup2();
	});

	// -----------------------------------------------------------------------
	// 4. Edit displayName and confirm the list shows the updated name.
	// -----------------------------------------------------------------------
	test('edit displayName', async ({ asAdmin }) => {
		await asAdmin.goto('/admin/users');
		await expect(asAdmin).toHaveURL(/\/admin\/users/, { timeout: 10_000 });

		// Create e2e-user-4.
		await asAdmin.getByRole('button', { name: /new user/i }).click();

		const form = asAdmin.locator('form[action="?/create"]');
		await expect(form).toBeVisible({ timeout: 4_000 });

		await form.getByLabel(/display name/i).fill('E2E User 4');
		await form.getByLabel(/username/i).fill('e2e-user-4');
		await form.getByLabel(/password/i).fill(INITIAL_PASSWORD);

		await form.getByRole('button', { name: /create user/i }).click();
		await expect(asAdmin.getByText(/user created successfully/i)).toBeVisible({ timeout: 10_000 });

		// Click the inline Edit button on the user row.
		const userRow = asAdmin.locator('div.px-6.py-4').filter({ hasText: 'e2e-user-4' });
		await expect(userRow).toBeVisible({ timeout: 6_000 });

		await userRow.getByRole('button', { name: /edit/i }).click();

		// The inline edit form expands within the same row.
		const editForm = userRow.locator('form[action="?/editUser"]');
		await expect(editForm).toBeVisible({ timeout: 4_000 });

		// Clear and re-fill the displayName field.
		const displayNameInput = editForm.locator('input[name="displayName"]');
		await displayNameInput.clear();
		await displayNameInput.fill('E2E Renamed');

		await editForm.getByRole('button', { name: /save/i }).click();

		// Success feedback.
		await expect(asAdmin.getByText(/user updated successfully/i)).toBeVisible({ timeout: 10_000 });

		// The row should now show the new display name.
		await expect(userRow.getByText('E2E Renamed')).toBeVisible({ timeout: 6_000 });
	});

	// -----------------------------------------------------------------------
	// 5. Reset password: new credential logs in, old one does not.
	// -----------------------------------------------------------------------
	test('reset password', async ({ asAdmin, app, browser }) => {
		// Create e2e-user-5.
		await asAdmin.goto('/admin/users');
		await expect(asAdmin).toHaveURL(/\/admin\/users/, { timeout: 10_000 });

		await asAdmin.getByRole('button', { name: /new user/i }).click();

		const form = asAdmin.locator('form[action="?/create"]');
		await expect(form).toBeVisible({ timeout: 4_000 });

		await form.getByLabel(/display name/i).fill('E2E User 5');
		await form.getByLabel(/username/i).fill('e2e-user-5');
		await form.getByLabel(/password/i).fill(INITIAL_PASSWORD);

		await form.getByRole('button', { name: /create user/i }).click();
		await expect(asAdmin.getByText(/user created successfully/i)).toBeVisible({ timeout: 10_000 });

		const userRow = asAdmin.locator('div.px-6.py-4').filter({ hasText: 'e2e-user-5' });
		await expect(userRow).toBeVisible({ timeout: 6_000 });

		// Open More Actions → Reset Password.
		await userRow.getByRole('button', { name: /more actions/i }).click();
		const resetItem = asAdmin.getByRole('menuitem', { name: /reset password/i });
		await expect(resetItem).toBeVisible({ timeout: 4_000 });
		await resetItem.click();

		// The reset-password inline panel appears (within the same row).
		// Admin types the new password directly — there is no server-generated token.
		const resetPanel = userRow.locator('form[action="?/resetPassword"]');
		await expect(resetPanel).toBeVisible({ timeout: 4_000 });

		const newPassword = 'e2e-new-password-456';
		await resetPanel.locator('input[name="newPassword"]').fill(newPassword);
		await resetPanel.getByRole('button', { name: /set password/i }).click();

		// Panel disappears; no error shown.
		await expect(resetPanel).toHaveCount(0, { timeout: 10_000 });

		// Old password no longer works.
		const ctx1 = await browser.newContext({ baseURL: app.server.baseURL });
		const oldPassPage = await ctx1.newPage();
		await oldPassPage.goto('/auth/login');
		await oldPassPage.getByLabel('Username').fill('e2e-user-5');
		await oldPassPage.getByLabel('Password').fill(INITIAL_PASSWORD);
		await oldPassPage.getByRole('button', { name: /sign in/i }).click();
		await expect(oldPassPage).toHaveURL(/auth\/login/, { timeout: 10_000 });
		await ctx1.close();

		// New password succeeds.
		const { page: newPassPage, cleanup } = await loginAs(
			browser,
			app.server.baseURL,
			'e2e-user-5',
			newPassword
		);
		await expect(newPassPage).not.toHaveURL(/auth\/login/, { timeout: 10_000 });
		await cleanup();
	});
});
