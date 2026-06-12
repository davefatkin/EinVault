import { test, expect } from '../lib/fixtures';

// Helper: create a companion via the /companions/new form and return its id
// extracted from the redirect URL.
async function createCompanion(
	page: import('@playwright/test').Page,
	name: string
): Promise<string> {
	await page.goto('/companions/new');
	await page.locator('#name').fill(name);
	await page.getByRole('button', { name: 'Add Companion' }).click();
	// Server redirects to /{id} on success
	await expect(page).not.toHaveURL(/\/companions\/new/, { timeout: 10_000 });
	const url = page.url();
	// URL is /{id} — extract the last path segment
	const id = url.split('/').filter(Boolean).pop()!;
	expect(id).toBeTruthy();
	return id;
}

test.describe('companion crud', () => {
	test('member creates a companion', async ({ asMember }) => {
		const id = await createCompanion(asMember, 'e2e-comp-create');
		// Should have landed on the companion dashboard page
		await expect(asMember).toHaveURL(new RegExp(id));
		// The companion name should be visible in the page heading (not a hidden dropdown option)
		await expect(asMember.locator('h1').filter({ hasText: 'e2e-comp-create' })).toBeVisible();
	});

	test('edit persists breed', async ({ asMember }) => {
		const id = await createCompanion(asMember, 'e2e-comp-edit');

		await asMember.goto(`/companions/${id}/edit`);
		await asMember.locator('#breed').fill('e2e-breed');
		await asMember.getByRole('button', { name: 'Save Changes' }).click();

		// After save the page stays on the edit page and shows a success toast
		await expect(asMember.getByText('Changes saved.')).toBeVisible({ timeout: 8_000 });

		// Reload and confirm the value is persisted
		await asMember.goto(`/companions/${id}/edit`);
		await expect(asMember.locator('#breed')).toHaveValue('e2e-breed');
	});

	test('empty name is rejected', async ({ asMember }) => {
		await asMember.goto('/companions/new');

		// The #name input has HTML `required`; clicking submit without filling it
		// triggers browser validation and never navigates away.
		await asMember.getByRole('button', { name: 'Add Companion' }).click();

		// URL must still be on /companions/new — no redirect to a companion page
		await expect(asMember).toHaveURL(/\/companions\/new/);

		// The name input should be invalid per the browser constraint API
		const nameInput = asMember.locator('#name');
		const validity = await nameInput.evaluate((el) => (el as HTMLInputElement).validity.valid);
		expect(validity).toBe(false);
	});

	test('admin can archive then restore a companion', async ({ asAdmin }) => {
		// Archive action is admin-only (confirmed in +page.server.ts).
		const id = await createCompanion(asAdmin, 'e2e-comp-archive');

		// Navigate to the edit page. The archive card is outside the tab switcher, always visible.
		await asAdmin.goto(`/companions/${id}/edit`);

		// Click the trigger button to reveal the archive panel.
		// Key from i18n: 'page.companion.edit.archiveButton' = 'Archive {name}'
		const triggerBtn = asAdmin.getByRole('button', { name: /Archive e2e-comp-archive/i });
		await triggerBtn.scrollIntoViewIfNeeded();
		await triggerBtn.click();

		// Wait for the archive form to appear in the DOM (it's inside {#if showArchivePanel}).
		const archiveForm = asAdmin.locator('form[action="?/archive"]');
		await expect(archiveForm).toBeVisible({ timeout: 5_000 });

		// The date field is pre-filled; submit immediately.
		await archiveForm.locator('button[type="submit"]').click();

		// Server redirects to /admin/companions after archive
		await expect(asAdmin).toHaveURL(/\/admin\/companions/, { timeout: 10_000 });

		// The "Past Companions" section must be visible on the admin companions page.
		await expect(asAdmin.getByText('Past Companions')).toBeVisible({ timeout: 8_000 });

		// The archived companion entry has a restore form scoped to it.
		// Use the restore form's hidden companionId input to uniquely identify the right form.
		const restoreForm = asAdmin.locator(`form[action*="restore"]:has(input[value="${id}"])`);
		await expect(restoreForm).toBeVisible();

		// Click the restore submit button
		await restoreForm.locator('button[type="submit"]').click();

		// After restore the companion moves from Past Companions back to the active Companions
		// list. The Past Companions section disappears once the list is empty (only one archived
		// companion in this test). Wait for "Past Companions" to leave the page as confirmation
		// that the server re-render completed, then verify the companion is active again.
		await expect(asAdmin.getByText('Past Companions')).toBeHidden({ timeout: 8_000 });

		// Companion should now appear in the active companions list
		await expect(
			asAdmin
				.locator('div')
				.filter({ hasText: /e2e-comp-archive/ })
				.first()
		).toBeVisible();
	});
});
