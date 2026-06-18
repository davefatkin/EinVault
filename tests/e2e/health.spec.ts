import { test, expect } from '../lib/fixtures';
import { pdfUpload } from '../lib/files';

const COMP = 'seed-comp-ein';

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
		await asMember.goto(`/${COMP}/health`);
		// The featured weight-trend section renders (its label is always present).
		// Don't assert a count-dependent state here: the `log weight` test shares
		// this worker's DB and may have added an entry, changing the chart state.
		await expect(asMember.getByText('Weight trend')).toBeVisible({ timeout: 8_000 });
	});

	test('a document attached to a health event is previewable from the event modal', async ({
		asMember
	}) => {
		// Upload a document and link it to the seeded "Wellness checkup" health event.
		await asMember.goto(`/${COMP}/documents`);
		await asMember.locator('input[type="file"]').setInputFiles(pdfUpload('e2e-health-attach.pdf'));
		await expect(asMember.getByText('e2e-health-attach.pdf')).toBeVisible({ timeout: 15_000 });
		const li = asMember.locator('li').filter({ hasText: 'e2e-health-attach.pdf' }).first();
		await li.getByRole('button', { name: 'Edit document' }).click();
		await asMember.locator('select[id^="doc-event-"]').selectOption('seed-health-1');
		await asMember.getByRole('button', { name: 'Save' }).first().click();
		await expect(asMember.getByText('Wellness checkup')).toBeVisible({ timeout: 8_000 });

		// On the health page, open the "Wellness checkup" event detail modal.
		await asMember.goto(`/${COMP}/health`);
		await asMember.getByText('Wellness checkup').first().click();
		const dialog = asMember.locator('[role="dialog"]');
		await expect(dialog).toBeVisible({ timeout: 8_000 });

		// The linked document appears in the modal and opens a preview when clicked.
		await dialog.getByRole('button', { name: /e2e-health-attach\.pdf/ }).click();
		await expect(asMember.getByRole('dialog', { name: 'e2e-health-attach.pdf' })).toBeVisible({
			timeout: 8_000
		});
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

	test('editing a weight entry via the ?edit deep link does not reopen after saving (#142)', async ({
		asMember
	}) => {
		// The dashboard weight detail modal's "Edit" button links here.
		await asMember.goto(`/${COMP}/health?edit=seed-weight-1`);

		const weightInput = asMember.locator('#edit-weight-seed-weight-1');
		await expect(weightInput).toBeVisible({ timeout: 8_000 });

		// Save without changing anything so other specs that read this seed
		// weight entry are unaffected.
		await asMember.getByRole('button', { name: 'Save', exact: true }).click();

		// The inline edit form must close and stay closed. It used to pop right
		// back open because the post-save reload re-fired the ?edit effect.
		await expect(weightInput).toHaveCount(0, { timeout: 8_000 });
		await asMember.waitForTimeout(800);
		await expect(weightInput).toHaveCount(0);
	});
});
