import { test, expect } from '../lib/fixtures';

const COMP = 'seed-comp-biscuit';

test.describe('health events and weight log', () => {
	test('add health event', async ({ asMember }) => {
		await asMember.goto(`/${COMP}/health`);

		await asMember.getByRole('button', { name: 'Add Event' }).click();
		await asMember.locator('#title').fill('e2e-health-vacc');
		await asMember.locator('select[name="type"]').selectOption('vaccination');
		await asMember.getByRole('button', { name: 'Save Event' }).click();

		// Form closes on success; event should now appear in the Health Events list
		await expect(asMember.getByText('e2e-health-vacc')).toBeVisible({ timeout: 8_000 });
	});

	test('edit event', async ({ asMember }) => {
		await asMember.goto(`/${COMP}/health`);

		// Create the event this test owns
		await asMember.getByRole('button', { name: 'Add Event' }).click();
		await asMember.locator('#title').fill('e2e-health-edit-src');
		await asMember.locator('select[name="type"]').selectOption('vaccination');
		await asMember.getByRole('button', { name: 'Save Event' }).click();
		await expect(asMember.getByText('e2e-health-edit-src')).toBeVisible({ timeout: 8_000 });

		// Open detail modal by clicking the event row
		await asMember.getByText('e2e-health-edit-src').click();

		// Click Edit in the modal
		const dialog = asMember.locator('[role="dialog"]');
		await dialog.getByRole('button', { name: 'Edit' }).click();

		// The inline edit form should now be visible; update the title
		const editTitleInput = asMember.locator('input[name="title"]').last();
		await editTitleInput.fill('e2e-health-edit-dst');
		await asMember.getByRole('button', { name: 'Save' }).first().click();

		// Updated title visible, old title gone
		await expect(asMember.getByText('e2e-health-edit-dst')).toBeVisible({ timeout: 8_000 });
		await expect(asMember.getByText('e2e-health-edit-src', { exact: true })).toHaveCount(0);
	});

	test('delete event', async ({ asMember }) => {
		await asMember.goto(`/${COMP}/health`);

		// Create a dedicated row for this test
		await asMember.getByRole('button', { name: 'Add Event' }).click();
		await asMember.locator('#title').fill('e2e-health-del');
		await asMember.locator('select[name="type"]').selectOption('other');
		await asMember.getByRole('button', { name: 'Save Event' }).click();
		await expect(asMember.getByText('e2e-health-del')).toBeVisible({ timeout: 8_000 });

		// Open detail modal
		await asMember.getByText('e2e-health-del').click();

		const dialog = asMember.locator('[role="dialog"]');
		await dialog.getByRole('button', { name: 'Delete' }).click();

		// ConfirmDialog appears — confirm deletion
		const confirmDialog = asMember.locator('[role="dialog"]');
		await confirmDialog.getByRole('button', { name: 'Delete' }).click();

		// Confirm the row is gone after reload
		await asMember.reload();
		await expect(asMember.getByText('e2e-health-del')).toHaveCount(0);
	});

	test('log weight', async ({ asMember }) => {
		await asMember.goto(`/${COMP}/health`);

		await asMember.getByRole('button', { name: 'Log Weight' }).click();
		await asMember.locator('#weight').fill('13.7');
		await asMember.getByRole('button', { name: 'Log Weight' }).last().click();

		// Weight history section should now show the recorded value
		await expect(
			asMember.locator('section').filter({ hasText: 'Weight History' }).getByText(/13\.7/)
		).toBeVisible({ timeout: 8_000 });
	});

	test('health page shows the weight trend section', async ({ asMember }) => {
		const COMP = 'seed-comp-biscuit';
		await asMember.goto(`/${COMP}/health`);
		await expect(asMember.getByText('Weight trend')).toBeVisible({ timeout: 8_000 });
		// Seed has 0 weight rows — assert the empty-state text (<2 entries, no svg).
		await expect(asMember.getByText('No weight recorded yet.')).toBeVisible({ timeout: 8_000 });
	});

	test('title required', async ({ asMember }) => {
		await asMember.goto(`/${COMP}/health`);

		await asMember.getByRole('button', { name: 'Add Event' }).click();
		// Leave title empty, submit immediately
		await asMember.getByRole('button', { name: 'Save Event' }).click();

		// Browser HTML `required` constraint prevents navigation; form stays open
		const titleInput = asMember.locator('#title');
		const valid = await titleInput.evaluate((el) => (el as HTMLInputElement).validity.valid);
		expect(valid).toBe(false);

		// Form should still be visible — no redirect/close occurred
		await expect(asMember.getByRole('button', { name: 'Save Event' })).toBeVisible();
	});
});
