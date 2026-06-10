import { test, expect } from '../lib/fixtures';
import { pngUpload } from '../lib/files';

const COMP = 'seed-comp-biscuit';

test.describe('journal day editor', () => {
	test('write entry with autosave', async ({ asMember }) => {
		await asMember.goto(`/${COMP}/journal/2026-05-01`);

		const textarea = asMember.locator('textarea');
		await textarea.fill('e2e journal body');

		// Select the Good mood (aria-pressed button with title 'Good')
		const goodBtn = asMember.locator('button[title="Good"]');
		await goodBtn.click();

		// Trigger blur by clicking the page heading
		await asMember.locator('h1').first().click();

		// Wait for the saved-status indicator
		await expect(asMember.getByText('✓ Saved')).toBeVisible({ timeout: 5_000 });

		// Reload and confirm persistence
		await asMember.reload();

		await expect(asMember.locator('textarea')).toHaveValue('e2e journal body');
		// Good mood pill should still be pressed
		await expect(asMember.locator('button[title="Good"][aria-pressed="true"]')).toBeVisible();
	});

	test('photo upload', async ({ asMember }) => {
		await asMember.goto(`/${COMP}/journal/2026-05-02`);

		// Write a short body so an entry row exists (upload needs entry id in some impls)
		const textarea = asMember.locator('textarea');
		await textarea.fill('e2e photo test');
		await asMember.locator('h1').first().click();
		await expect(asMember.getByText('✓ Saved')).toBeVisible({ timeout: 5_000 });

		// The file input is visually hidden inside the label; setInputFiles works on hidden inputs
		const fileInput = asMember.locator('input[type="file"][name="photos"]').first();
		await fileInput.setInputFiles(pngUpload());

		// Wait for a photo thumbnail to appear
		await expect(asMember.locator('img[src*="/api/photos/journal/"]').first()).toBeVisible({
			timeout: 15_000
		});

		// Reload and confirm the photo is still there
		await asMember.reload();
		await expect(asMember.locator('img[src*="/api/photos/journal/"]').first()).toBeVisible({
			timeout: 10_000
		});
	});

	test('caption edit and photo delete', async ({ asMember }) => {
		// Start from the 2026-05-02 page where the photo was uploaded in the prior test.
		// Each test gets its own worker-scoped seeded DB — the photo was uploaded in the
		// same worker above, so it persists. But because Playwright can run tests in any
		// order within a describe, we ensure the photo exists first.
		await asMember.goto(`/${COMP}/journal/2026-05-02`);

		// Make sure a photo is present; if not, upload one.
		const photoImg = asMember.locator('img[src*="/api/photos/journal/"]').first();
		const count = await photoImg.count();
		if (count === 0) {
			const textarea = asMember.locator('textarea');
			await textarea.fill('e2e caption test');
			await asMember.locator('h1').first().click();
			await expect(asMember.getByText('✓ Saved')).toBeVisible({ timeout: 5_000 });

			const fileInput = asMember.locator('input[type="file"][name="photos"]').first();
			await fileInput.setInputFiles(pngUpload());
			await expect(photoImg).toBeVisible({ timeout: 15_000 });
		}

		// Click "Edit Caption"
		const editCaptionBtn = asMember.getByRole('button', { name: 'Edit Caption' }).first();
		await editCaptionBtn.click();

		// Fill in the caption textarea
		const captionInput = asMember.locator('textarea[name="photo-notes"]').first();
		await captionInput.fill('e2e-caption');

		// Save
		await asMember.getByRole('button', { name: 'Save' }).first().click();

		// Caption text should now appear
		await expect(asMember.getByText('e2e-caption')).toBeVisible({ timeout: 5_000 });

		// Reload and confirm caption persisted
		await asMember.reload();
		await expect(asMember.getByText('e2e-caption')).toBeVisible({ timeout: 5_000 });

		// Delete the photo
		// Hover the photo thumbnail to reveal the delete button
		const photoContainer = asMember
			.locator('div.group')
			.filter({ has: asMember.locator('img[src*="/api/photos/journal/"]') })
			.first();
		await photoContainer.hover();

		const deleteBtn = photoContainer.locator('button[aria-label]');
		await deleteBtn.click();

		// Confirm in the dialog (scope to the confirm dialog to avoid the aria-labeled trash button)
		const confirmDialog = asMember.locator('[role="dialog"]');
		await confirmDialog.getByRole('button', { name: 'Delete' }).click();

		// Photo should be gone
		await expect(asMember.locator('img[src*="/api/photos/journal/"]')).toHaveCount(0, {
			timeout: 5_000
		});

		// Reload and confirm still gone
		await asMember.reload();
		await expect(asMember.locator('img[src*="/api/photos/journal/"]')).toHaveCount(0, {
			timeout: 5_000
		});
	});

	test('journal list shows entries', async ({ asMember }) => {
		await asMember.goto(`/${COMP}/journal`);

		// The seed entry body is rendered as markdown HTML; the raw text will appear
		// inside the prose container
		await expect(asMember.getByText('Seed journal entry')).toBeVisible({ timeout: 8_000 });
	});

	test('edit shows the editor alongside the original author', async ({ asMember, asAdmin }) => {
		const date = '2026-05-20';

		// Member authors the entry.
		await asMember.goto(`/${COMP}/journal/${date}`);
		await asMember.locator('textarea').first().fill('authored by member');
		await asMember.locator('h1').first().click();
		await expect(asMember.getByText('✓ Saved')).toBeVisible({ timeout: 8_000 });

		// Admin edits the same entry.
		await asAdmin.goto(`/${COMP}/journal/${date}`);
		await asAdmin.locator('textarea').first().fill('edited by admin');
		await asAdmin.locator('h1').first().click();
		await expect(asAdmin.getByText('✓ Saved')).toBeVisible({ timeout: 8_000 });

		// List shows both attributions on that entry's card.
		await asMember.goto(`/${COMP}/journal`);
		// Scope to the card containing the edited body text (each entry is a rounded-lg border card).
		const card = asMember
			.locator('div.rounded-lg.border.bg-card')
			.filter({ hasText: 'edited by admin' });
		await expect(card.getByText(/by Seed Member/)).toBeVisible({ timeout: 8_000 });
		await expect(card.getByText(/edited by Seed Admin/)).toBeVisible({ timeout: 8_000 });

		// The day editor page shows the same attribution in its header.
		await asMember.goto(`/${COMP}/journal/${date}`);
		await expect(asMember.getByText(/edited by Seed Admin/).first()).toBeVisible({
			timeout: 8_000
		});
	});
});
