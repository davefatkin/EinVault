import Database from 'better-sqlite3';
import path from 'node:path';
import { test, expect, type AppWorker } from '../lib/fixtures';
import { pdfUpload } from '../lib/files';
import { waitForHydration } from '../lib/hydration';

const COMP = 'seed-comp-ein';

function workerDb(app: AppWorker) {
	const sqlite = new Database(path.join(app.dataDir, 'einvault.db'));
	sqlite.pragma('foreign_keys = ON');
	return sqlite;
}

test.describe('health events and weight log', () => {
	test('add health event', async ({ asMember }) => {
		await asMember.goto(`/${COMP}/health`);
		await waitForHydration(asMember);

		await asMember.getByRole('button', { name: 'Add Event' }).click();
		await asMember.locator('#title').fill('e2e-health-vacc');
		await asMember.locator('select[name="type"]').selectOption('vaccination');
		await asMember.getByRole('button', { name: 'Save Event' }).click();

		// Form closes on success; event should now appear in the Health Events list
		await expect(asMember.getByText('e2e-health-vacc')).toBeVisible({ timeout: 8_000 });
	});

	test('edit event', async ({ asMember }) => {
		await asMember.goto(`/${COMP}/health`);
		await waitForHydration(asMember);

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
		await waitForHydration(asMember);

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
		await waitForHydration(asMember);

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
		await waitForHydration(asMember);
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
		await waitForHydration(asMember);
		await asMember.locator('input[type="file"]').setInputFiles(pdfUpload('e2e-health-attach.pdf'));
		await expect(asMember.getByText('e2e-health-attach.pdf')).toBeVisible({ timeout: 15_000 });
		const li = asMember.locator('li').filter({ hasText: 'e2e-health-attach.pdf' }).first();
		await li.getByRole('button', { name: 'Edit document' }).click();
		await asMember.locator('select[id^="doc-event-"]').selectOption('seed-health-1');
		await asMember.getByRole('button', { name: 'Save' }).first().click();
		await expect(asMember.getByText('Wellness checkup')).toBeVisible({ timeout: 8_000 });

		// On the health page, open the "Wellness checkup" event detail modal.
		await asMember.goto(`/${COMP}/health`);
		await waitForHydration(asMember);
		await asMember.getByText('Wellness checkup').first().click();
		const dialog = asMember.locator('[role="dialog"]');
		await expect(dialog).toBeVisible({ timeout: 8_000 });

		// The linked document appears in the modal and opens a preview when clicked.
		await dialog.getByRole('button', { name: /e2e-health-attach\.pdf/ }).click();
		await expect(asMember.getByRole('dialog', { name: 'e2e-health-attach.pdf' })).toBeVisible({
			timeout: 8_000
		});
	});

	test('add event with a new file, an existing document and a category', async ({ asMember }) => {
		const stamp = Date.now().toString(36);
		const existing = `e2e-hp-existing-${stamp}.pdf`;
		const fresh = `e2e-hp-new-${stamp}.pdf`;
		const title = `e2e-hp-visit-${stamp}`;

		// An unattached document this test owns.
		await asMember.goto(`/${COMP}/documents`);
		await waitForHydration(asMember);
		await asMember.locator('input[type="file"]').setInputFiles(pdfUpload(existing));
		await expect(asMember.getByText(existing)).toBeVisible({ timeout: 8_000 });

		await asMember.goto(`/${COMP}/health`);
		await waitForHydration(asMember);
		await asMember.getByRole('button', { name: 'Add Event' }).click();
		const form = asMember.locator('form[action="?/addHealth"]');
		await form.locator('#title').fill(title);
		await form.locator('#type').selectOption('vet_visit');
		await form.getByTestId('attach-files').setInputFiles(pdfUpload(fresh));
		await form.getByRole('checkbox', { name: new RegExp(existing) }).check();
		await form.locator('#new-attach-category').selectOption({ label: 'Medical' });
		await form.getByRole('button', { name: 'Save Event' }).click();
		await expect(form).toHaveCount(0, { timeout: 10_000 });

		const row = asMember.getByRole('button', { name: new RegExp(title) });
		await expect(row).toContainText(existing);
		await expect(row).toContainText(fresh);

		await asMember.goto(`/${COMP}/documents`);
		await waitForHydration(asMember);
		const freshRow = asMember.locator('li').filter({ hasText: fresh }).first();
		await expect(freshRow).toContainText(title, { timeout: 8_000 });
		await expect(freshRow).toContainText('Medical');
		await expect(asMember.locator('li').filter({ hasText: existing }).first()).toContainText(title);
	});

	test('a failed upload keeps the new event and names the file', async ({ asMember }) => {
		const stamp = Date.now().toString(36);
		const title = `e2e-hp-partial-${stamp}`;
		const bad = `e2e-hp-bad-${stamp}.txt`;
		await asMember.goto(`/${COMP}/health`);
		await waitForHydration(asMember);
		await asMember.getByRole('button', { name: 'Add Event' }).click();
		const form = asMember.locator('form[action="?/addHealth"]');
		await form.locator('#title').fill(title);
		await form
			.getByTestId('attach-files')
			.setInputFiles({ name: bad, mimeType: 'text/plain', buffer: Buffer.from('hello') });
		await form.getByRole('button', { name: 'Save Event' }).click();

		await expect(asMember.getByText(bad)).toBeVisible({ timeout: 10_000 });
		await expect(form).toHaveCount(0);
		await asMember.getByRole('button', { name: 'Close', exact: true }).click();
		await expect(asMember.getByText(bad)).toHaveCount(0);
		await expect(asMember.getByRole('button', { name: new RegExp(title) })).toBeVisible();
	});

	test('Save & Add Reminder with an attachment ends on the reminder page', async ({
		asMember,
		app
	}) => {
		const stamp = Date.now().toString(36);
		const title = `e2e-hp-reminder-${stamp}`;
		const file = `e2e-hp-reminder-${stamp}.pdf`;
		await asMember.goto(`/${COMP}/health`);
		await waitForHydration(asMember);
		await asMember.getByRole('button', { name: 'Add Event' }).click();
		const form = asMember.locator('form[action="?/addHealth"]');
		await form.locator('#title').fill(title);
		await form.getByTestId('attach-files').setInputFiles(pdfUpload(file));
		// The reminders page strips ?new=1 right after reading it, so wait from before the click.
		const toReminders = asMember.waitForURL(
			(url) =>
				url.pathname === `/${COMP}/reminders` &&
				url.searchParams.get('new') === '1' &&
				url.searchParams.get('title') === title
		);
		await form.getByRole('button', { name: 'Save & Add Reminder' }).click();
		await toReminders;
		await expect(asMember.locator('#title')).toHaveValue(title, { timeout: 8_000 });

		const sqlite = workerDb(app);
		const linked = sqlite
			.prepare(
				`SELECT h.title FROM documents d JOIN health_events h ON h.id = d.health_event_id
				 WHERE d.title = ?`
			)
			.get(file);
		sqlite.close();
		expect(linked).toEqual({ title });
	});

	test('a failed save keeps the form open with the error and the picked file', async ({
		asMember
	}) => {
		await asMember.goto(`/${COMP}/health`);
		await waitForHydration(asMember);
		await asMember.getByRole('button', { name: 'Add Event' }).click();
		const form = asMember.locator('form[action="?/addHealth"]');
		await form.getByTestId('attach-files').setInputFiles(pdfUpload('e2e-hp-kept.pdf'));
		await form.locator('#title').evaluate((el) => el.removeAttribute('required'));
		await form.locator('#title').fill('');
		await form.getByRole('button', { name: 'Save Event' }).click();

		const message = 'Title and a valid type are required.';
		await expect(form.getByRole('alert')).toHaveText(message, { timeout: 8_000 });
		await expect(asMember.getByText(message)).toHaveCount(1);
		await expect(form.getByRole('button', { name: 'Save Event' })).toBeEnabled();
		const count = await form
			.getByTestId('attach-files')
			.evaluate((el) => (el as HTMLInputElement).files?.length ?? 0);
		expect(count).toBe(1);
	});

	test('title required', async ({ asMember }) => {
		await asMember.goto(`/${COMP}/health`);
		await waitForHydration(asMember);

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
		await waitForHydration(asMember);

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

	test('the add form points to Medications instead of offering the type', async ({ asMember }) => {
		await asMember.goto(`/${COMP}/health`);
		await waitForHydration(asMember);
		await asMember.getByRole('button', { name: 'Add Event' }).click();
		await expect(asMember.locator('#type option')).not.toHaveCount(0);
		await expect(asMember.locator('#type option[value="medication"]')).toHaveCount(0);
		await expect(asMember.getByRole('link', { name: 'Medications page' })).toHaveAttribute(
			'href',
			`/${COMP}/medications`
		);
	});

	test('editing an existing Medication event keeps its type', async ({ asMember, app }) => {
		const id = `e2e-med-event-${Date.now()}`;
		const sqlite = workerDb(app);
		sqlite
			.prepare(
				`INSERT INTO health_events (id, companion_id, type, title, occurred_at)
				 VALUES (?, ?, 'medication', ?, unixepoch())`
			)
			.run(id, COMP, 'e2e-old-med-event');
		sqlite.close();
		try {
			await asMember.goto(`/${COMP}/health?edit=${id}`);
			await waitForHydration(asMember);
			const type = asMember.locator(`#edit-type-${id}`);
			await expect(type).toHaveValue('medication', { timeout: 8_000 });
			await asMember.locator(`#edit-title-${id}`).fill('e2e-old-med-event-edited');
			await asMember.getByRole('button', { name: 'Save', exact: true }).click();
			await expect(asMember.getByText('e2e-old-med-event-edited')).toBeVisible({
				timeout: 8_000
			});

			const check = workerDb(app);
			const row = check.prepare('SELECT type, title FROM health_events WHERE id = ?').get(id);
			check.close();
			expect(row).toEqual({ type: 'medication', title: 'e2e-old-med-event-edited' });
		} finally {
			const db = workerDb(app);
			db.prepare('DELETE FROM health_events WHERE id = ?').run(id);
			db.close();
		}
	});
});
