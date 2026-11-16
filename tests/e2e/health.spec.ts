import Database from 'better-sqlite3';
import path from 'node:path';
import type { Page } from '@playwright/test';
import { test, expect, type AppWorker } from '../lib/fixtures';
import { pdfUpload } from '../lib/files';
import { waitForHydration } from '../lib/hydration';

const COMP = 'seed-comp-ein';

function workerDb(app: AppWorker) {
	const sqlite = new Database(path.join(app.dataDir, 'einvault.db'));
	sqlite.pragma('foreign_keys = ON');
	return sqlite;
}

/** Adds an event with one new file through the Health page; returns its id. */
async function addEventWithFile(page: Page, app: AppWorker, title: string, file: string) {
	await page.goto(`/${COMP}/health`);
	await waitForHydration(page);
	await page.getByRole('button', { name: 'Add Event' }).click();
	const form = page.locator('form[action="?/addHealth"]');
	await form.locator('#title').fill(title);
	await form.getByTestId('attach-files').setInputFiles(pdfUpload(file));
	await form.getByRole('button', { name: 'Save Event' }).click();
	await expect(form).toHaveCount(0, { timeout: 10_000 });
	await expect(page.getByRole('button', { name: new RegExp(title) })).toContainText(file);
	const sqlite = workerDb(app);
	const row = sqlite.prepare('SELECT id FROM health_events WHERE title = ?').get(title) as {
		id: string;
	};
	sqlite.close();
	return row.id;
}

async function openEdit(page: Page, id: string) {
	await page.goto(`/${COMP}/health?edit=${id}`);
	await waitForHydration(page);
	const form = page.locator('form[action="?/updateHealth"]');
	await expect(form.locator(`#edit-title-${id}`)).toBeVisible({ timeout: 8_000 });
	return form;
}

/** health_event_id by document title, for the titles that exist. */
function docEvents(app: AppWorker, titles: string[]) {
	const sqlite = workerDb(app);
	const rows = sqlite
		.prepare(
			`SELECT title, health_event_id AS eventId FROM documents
			 WHERE title IN (${titles.map(() => '?').join(', ')})`
		)
		.all(...titles) as { title: string; eventId: string | null }[];
	sqlite.close();
	return Object.fromEntries(rows.map((r) => [r.title, r.eventId]));
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

	test('edit attaches a file and removes a document, which stays on Documents', async ({
		asMember,
		app
	}) => {
		const stamp = Date.now().toString(36);
		const title = `e2e-he-swap-${stamp}`;
		const old = `e2e-he-old-${stamp}.pdf`;
		const fresh = `e2e-he-new-${stamp}.pdf`;
		const id = await addEventWithFile(asMember, app, title, old);

		const form = await openEdit(asMember, id);
		await form.getByTestId('attach-files').setInputFiles(pdfUpload(fresh));
		await form.getByRole('button', { name: `Remove ${old}` }).click();
		await expect(form.getByRole('button', { name: `Keep ${old}` })).toBeVisible();
		await form.getByRole('button', { name: 'Save', exact: true }).click();
		await expect(form).toHaveCount(0, { timeout: 10_000 });

		const row = asMember.getByRole('button', { name: new RegExp(title) });
		await expect(row).toContainText(fresh);
		await expect(row).not.toContainText(old);

		await asMember.goto(`/${COMP}/documents`);
		await waitForHydration(asMember);
		await expect(asMember.locator('li').filter({ hasText: old }).first()).toBeVisible({
			timeout: 8_000
		});
		expect(docEvents(app, [old, fresh])).toEqual({ [old]: null, [fresh]: id });
	});

	test('removing a document that moved to another event meanwhile leaves it there', async ({
		asMember,
		app
	}) => {
		const stamp = Date.now().toString(36);
		const title = `e2e-he-gone-${stamp}`;
		const other = `e2e-he-elsewhere-${stamp}`;
		const moved = `e2e-he-moved-${stamp}.pdf`;
		const otherId = await addEventWithFile(asMember, app, other, `e2e-he-o-${stamp}.pdf`);
		const id = await addEventWithFile(asMember, app, title, moved);

		const form = await openEdit(asMember, id);
		await form.getByRole('button', { name: `Remove ${moved}` }).click();
		// Someone else files the document under the other event before Save.
		const sqlite = workerDb(app);
		sqlite.prepare('UPDATE documents SET health_event_id = ? WHERE title = ?').run(otherId, moved);
		sqlite.close();
		await form.getByRole('button', { name: 'Save', exact: true }).click();

		await expect(asMember.getByText(`Already attached to ${other}`)).toBeVisible({
			timeout: 10_000
		});
		expect(docEvents(app, [moved])).toEqual({ [moved]: otherId });
	});

	test("edit uploads take the event's new date", async ({ asMember, app }) => {
		const stamp = Date.now().toString(36);
		const title = `e2e-he-date-${stamp}`;
		const file = `e2e-he-dated-${stamp}.pdf`;
		const id = await addEventWithFile(asMember, app, title, `e2e-he-first-${stamp}.pdf`);

		const form = await openEdit(asMember, id);
		await form.locator(`#edit-occurredAt-${id}`).fill('2026-02-03T12:00');
		await form.getByTestId('attach-files').setInputFiles(pdfUpload(file));
		await form.getByRole('button', { name: 'Save', exact: true }).click();
		await expect(form).toHaveCount(0, { timeout: 10_000 });
		await expect(asMember.getByRole('button', { name: new RegExp(title) })).toContainText(file);

		const sqlite = workerDb(app);
		const row = sqlite
			.prepare('SELECT document_date AS documentDate FROM documents WHERE title = ?')
			.get(file);
		sqlite.close();
		expect(row).toEqual({ documentDate: '2026-02-03' });
	});

	test('canceling edit applies nothing', async ({ asMember, app }) => {
		const stamp = Date.now().toString(36);
		const title = `e2e-he-cancel-${stamp}`;
		const kept = `e2e-he-kept-${stamp}.pdf`;
		const dropped = `e2e-he-dropped-${stamp}.pdf`;
		const id = await addEventWithFile(asMember, app, title, kept);

		let form = await openEdit(asMember, id);
		await form.getByRole('button', { name: `Remove ${kept}` }).click();
		await form.getByTestId('attach-files').setInputFiles(pdfUpload(dropped));
		await form.getByRole('button', { name: 'Cancel', exact: true }).click();
		await expect(form).toHaveCount(0);

		const row = asMember.getByRole('button', { name: new RegExp(title) });
		await expect(row).toContainText(kept);
		await expect(row).not.toContainText(dropped);
		expect(docEvents(app, [kept, dropped])).toEqual({ [kept]: id });

		// Reopen in place, without a reload: the form starts clean.
		await row.click();
		await asMember.getByRole('dialog').getByRole('button', { name: 'Edit' }).click();
		form = asMember.locator('form[action="?/updateHealth"]');
		await expect(form.getByRole('button', { name: `Remove ${kept}` })).toBeVisible();
		await expect(form.getByText('Will be removed')).toHaveCount(0);
		const count = await form
			.getByTestId('attach-files')
			.evaluate((el) => (el as HTMLInputElement).files?.length ?? 0);
		expect(count).toBe(0);
	});

	test('a failed edit keeps the form open with the error', async ({ asMember, app }) => {
		const stamp = Date.now().toString(36);
		const title = `e2e-he-fail-${stamp}`;
		const id = await addEventWithFile(asMember, app, title, `e2e-he-on-${stamp}.pdf`);

		const form = await openEdit(asMember, id);
		await form.getByTestId('attach-files').setInputFiles(pdfUpload(`e2e-he-kept-${stamp}.pdf`));
		const titleInput = form.locator(`#edit-title-${id}`);
		await titleInput.evaluate((el) => el.removeAttribute('required'));
		await titleInput.fill('');
		await form.getByRole('button', { name: 'Save', exact: true }).click();

		const message = 'Title and a valid type are required.';
		await expect(form.getByRole('alert')).toHaveText(message, { timeout: 8_000 });
		await expect(asMember.getByText(message)).toHaveCount(1);
		await expect(form.getByRole('button', { name: 'Save', exact: true })).toBeEnabled();
		const count = await form
			.getByTestId('attach-files')
			.evaluate((el) => (el as HTMLInputElement).files?.length ?? 0);
		expect(count).toBe(1);
	});

	test('a failed edit upload names the file, and no other Edit opens while saving', async ({
		asMember,
		app
	}) => {
		const stamp = Date.now().toString(36);
		const title = `e2e-he-badfile-${stamp}`;
		const other = `e2e-he-other-${stamp}`;
		const bad = `e2e-he-bad-${stamp}.txt`;
		await addEventWithFile(asMember, app, other, `e2e-he-other-${stamp}.pdf`);
		const id = await addEventWithFile(asMember, app, title, `e2e-he-good-${stamp}.pdf`);

		// Hold the upload so the save stays in flight.
		let release!: () => void;
		const held = new Promise<void>((resolve) => (release = resolve));
		await asMember.route(`**/api/companions/${COMP}/documents`, async (route) => {
			await held;
			await route.continue();
		});

		const form = await openEdit(asMember, id);
		await form
			.getByTestId('attach-files')
			.setInputFiles({ name: bad, mimeType: 'text/plain', buffer: Buffer.from('hello') });
		await form.getByRole('button', { name: 'Save', exact: true }).click();

		const otherRow = asMember.getByRole('button', { name: new RegExp(other) });
		const otherEdit = otherRow.locator('..').getByRole('button', { name: 'Edit' });
		await expect(otherEdit).toBeDisabled();
		await otherRow.click();
		const detail = asMember.getByRole('dialog');
		await expect(detail.getByRole('button', { name: 'Edit' })).toBeDisabled();
		await asMember.keyboard.press('Escape');
		await expect(detail).toHaveCount(0);
		release();

		await expect(asMember.getByText(bad)).toBeVisible({ timeout: 10_000 });
		await expect(form).toHaveCount(0);
		await asMember.getByRole('button', { name: 'Close', exact: true }).click();
		await expect(asMember.getByText(bad)).toHaveCount(0);
		await expect(asMember.getByRole('button', { name: new RegExp(title) })).toBeVisible();
		await expect(otherEdit).toBeEnabled();
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
