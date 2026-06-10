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

// Helper: create a user via the admin UI.
async function createUser(
	asAdmin: import('@playwright/test').Page,
	{ displayName, username }: { displayName: string; username: string }
): Promise<void> {
	await asAdmin.goto('/admin/users');
	await expect(asAdmin).toHaveURL(/\/admin\/users/, { timeout: 10_000 });

	await asAdmin.getByRole('button', { name: /new user/i }).click();

	const form = asAdmin.locator('form[action="?/create"]');
	await expect(form).toBeVisible({ timeout: 4_000 });

	await form.getByLabel(/display name/i).fill(displayName);
	await form.getByLabel(/username/i).fill(username);
	await form.getByLabel(/password/i).fill(INITIAL_PASSWORD);

	await form.getByRole('button', { name: /create user/i }).click();
	await expect(asAdmin.getByText(/user created successfully/i)).toBeVisible({ timeout: 10_000 });
}

test.describe('settings', () => {
	// -------------------------------------------------------------------------
	// 1. Account fields persist across reload.
	// -------------------------------------------------------------------------
	test('account fields persist', async ({ asMember }) => {
		await asMember.goto('/settings');
		await expect(asMember).toHaveURL(/\/settings/, { timeout: 10_000 });

		// Fill in the phone field only (do not touch username).
		const phoneInput = asMember.locator('input[name="phone"]');
		await phoneInput.clear();
		await phoneInput.fill('555-0100');

		// Save.
		await asMember
			.locator('form[action="?/account"]')
			.getByRole('button', { name: /save changes/i })
			.click();
		await expect(asMember.getByText(/account updated/i)).toBeVisible({ timeout: 8_000 });

		// Reload and check the value persisted.
		await asMember.reload();
		await expect(asMember.locator('input[name="phone"]')).toHaveValue('555-0100', {
			timeout: 6_000
		});

		// Clean up: clear the phone field so it doesn't bleed into other tests
		// that share the same member session.
		await asMember.locator('input[name="phone"]').clear();
		await asMember
			.locator('form[action="?/account"]')
			.getByRole('button', { name: /save changes/i })
			.click();
		await expect(asMember.getByText(/account updated/i)).toBeVisible({ timeout: 8_000 });
	});

	// -------------------------------------------------------------------------
	// 2. Theme switch persists.
	// Theme mechanism: applyTheme() adds/removes the 'dark' class on <html>.
	// The toggle is in the app layout header (aria-pressed buttons), not on
	// the settings page. Selecting "Dark" posts ?/theme and sets a cookie +
	// DB value; on reload the layout re-applies the class via the $effect.
	// -------------------------------------------------------------------------
	test('theme switch persists', async ({ asMember }) => {
		await asMember.goto('/settings');
		await expect(asMember).toHaveURL(/\/settings/, { timeout: 10_000 });

		// Click the "Dark mode" button in the header theme toggle.
		await asMember.getByRole('button', { name: /dark mode/i }).click();

		// applyTheme runs synchronously in the browser; html.dark should be set.
		await expect(asMember.locator('html')).toHaveClass(/dark/, { timeout: 6_000 });

		// Reload: the layout $effect should re-apply dark based on the saved theme.
		await asMember.reload();
		await expect(asMember.locator('html')).toHaveClass(/dark/, { timeout: 6_000 });

		// Reset to system so the shared session is not left in dark mode. The
		// reload forces the reset POST to complete before the test ends —
		// otherwise context teardown can abort it and leak dark mode to later tests.
		await asMember.getByRole('button', { name: /system mode/i }).click();
		await asMember.reload();
		await expect(asMember.locator('html')).not.toHaveClass(/dark/, { timeout: 6_000 });
	});

	// -------------------------------------------------------------------------
	// 3. Password change: new password works, old one fails.
	// Creates a dedicated user so the shared member session is untouched.
	// -------------------------------------------------------------------------
	test('password change works', async ({ asAdmin, app, browser }) => {
		await createUser(asAdmin, {
			displayName: 'E2E Settings PW',
			username: 'e2e-settings-pw'
		});

		// Log in as the new user in an isolated context.
		const { page, cleanup } = await loginAs(
			browser,
			app.server.baseURL,
			'e2e-settings-pw',
			INITIAL_PASSWORD
		);

		try {
			await expect(page).not.toHaveURL(/auth\/login/, { timeout: 10_000 });

			await page.goto('/settings');
			await expect(page).toHaveURL(/\/settings/, { timeout: 6_000 });

			// Open password change fields.
			await page.getByRole('button', { name: /change password/i }).click();

			await page.locator('input[name="currentPassword"]').fill(INITIAL_PASSWORD);
			await page.locator('input[name="newPassword"]').fill('e2e-password-456');
			await page.locator('input[name="confirmPassword"]').fill('e2e-password-456');

			await page
				.locator('form[action="?/account"]')
				.getByRole('button', { name: /save changes/i })
				.click();
			await expect(page.getByText(/account updated/i)).toBeVisible({ timeout: 8_000 });
		} finally {
			await cleanup();
		}

		// Old password must fail.
		const ctx1 = await browser.newContext({ baseURL: app.server.baseURL });
		const oldPassPage = await ctx1.newPage();
		await oldPassPage.goto('/auth/login');
		await oldPassPage.getByLabel('Username').fill('e2e-settings-pw');
		await oldPassPage.getByLabel('Password').fill(INITIAL_PASSWORD);
		await oldPassPage.getByRole('button', { name: /sign in/i }).click();
		await expect(oldPassPage).toHaveURL(/auth\/login/, { timeout: 10_000 });
		await ctx1.close();

		// New password must succeed.
		const { page: newPassPage, cleanup: cleanup2 } = await loginAs(
			browser,
			app.server.baseURL,
			'e2e-settings-pw',
			'e2e-password-456'
		);
		await expect(newPassPage).not.toHaveURL(/auth\/login/, { timeout: 10_000 });
		await cleanup2();
	});

	// -------------------------------------------------------------------------
	// 4. Wrong current password is rejected.
	// Creates a dedicated user to avoid state dependency on test 3.
	// -------------------------------------------------------------------------
	test('wrong current password rejected', async ({ asAdmin, app, browser }) => {
		await createUser(asAdmin, {
			displayName: 'E2E Settings PW2',
			username: 'e2e-settings-pw2'
		});

		const { page, cleanup } = await loginAs(
			browser,
			app.server.baseURL,
			'e2e-settings-pw2',
			INITIAL_PASSWORD
		);

		try {
			await expect(page).not.toHaveURL(/auth\/login/, { timeout: 10_000 });

			await page.goto('/settings');
			await expect(page).toHaveURL(/\/settings/, { timeout: 6_000 });

			// Open password change fields.
			await page.getByRole('button', { name: /change password/i }).click();

			// Deliberately use wrong current password.
			await page.locator('input[name="currentPassword"]').fill('wrong-password-xyz');
			await page.locator('input[name="newPassword"]').fill('e2e-password-456');
			await page.locator('input[name="confirmPassword"]').fill('e2e-password-456');

			await page
				.locator('form[action="?/account"]')
				.getByRole('button', { name: /save changes/i })
				.click();

			// Error should be visible.
			await expect(page.getByText(/current password is incorrect/i)).toBeVisible({
				timeout: 8_000
			});
		} finally {
			await cleanup();
		}

		// The password was NOT changed; the new password must not work.
		const ctx = await browser.newContext({ baseURL: app.server.baseURL });
		const tryPage = await ctx.newPage();
		await tryPage.goto('/auth/login');
		await tryPage.getByLabel('Username').fill('e2e-settings-pw2');
		await tryPage.getByLabel('Password').fill('e2e-password-456');
		await tryPage.getByRole('button', { name: /sign in/i }).click();
		await expect(tryPage).toHaveURL(/auth\/login/, { timeout: 10_000 });
		await ctx.close();
	});

	// -------------------------------------------------------------------------
	// 5. Notification checkbox persists.
	// The seed member has an email address. Mail is enabled in the worker env.
	// The reminder-email checkbox is auto-submitted via onchange → formEl.requestSubmit().
	// -------------------------------------------------------------------------
	test('notification checkbox persists', async ({ asMember }) => {
		await asMember.goto('/settings');
		await expect(asMember).toHaveURL(/\/settings/, { timeout: 10_000 });

		const reminderCheckbox = asMember.locator('input[name="notifyReminderEmail"]');
		await expect(reminderCheckbox).toBeVisible({ timeout: 6_000 });

		// Record starting state and ensure we start from unchecked.
		const wasChecked = await reminderCheckbox.isChecked();
		if (wasChecked) {
			// Uncheck first to establish a clean baseline.
			await reminderCheckbox.click();
			// Wait for the auto-submit to settle.
			await expect(asMember.getByText(/notification settings updated/i)).toBeVisible({
				timeout: 8_000
			});
			await asMember.reload();
		}

		// Now check the box (should trigger auto-submit).
		await asMember.locator('input[name="notifyReminderEmail"]').click();
		await expect(asMember.getByText(/notification settings updated/i)).toBeVisible({
			timeout: 8_000
		});

		// Reload and verify still checked.
		await asMember.reload();
		await expect(asMember.locator('input[name="notifyReminderEmail"]')).toBeChecked({
			timeout: 6_000
		});

		// Clean up: uncheck to restore original state.
		await asMember.locator('input[name="notifyReminderEmail"]').click();
		await expect(asMember.getByText(/notification settings updated/i)).toBeVisible({
			timeout: 8_000
		});
	});
});
