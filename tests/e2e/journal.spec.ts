import { test, expect } from '../lib/fixtures';
import { pngUpload, pdfUpload } from '../lib/files';
import { todayUTC } from '../lib/dates';
import { waitForHydration } from '../lib/hydration';

const COMP = 'seed-comp-ein';

test.describe('journal day editor', () => {
	test('write entry with autosave', async ({ asMember }) => {
		await asMember.goto(`/${COMP}/journal/2026-05-01`);
		await waitForHydration(asMember);

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

	test('autosave reports a signed-out save and retries after sign-in (#318)', async ({
		asMember
	}) => {
		await asMember.goto(`/${COMP}/journal/2026-05-04`);
		await waitForHydration(asMember);

		// Drop the session cookie in this context only; the server session stays
		// valid, so restoring the cookie stands in for signing in again.
		const cookies = await asMember.context().cookies();
		await asMember.context().clearCookies();

		await asMember.locator('textarea').fill('e2e written while signed out');
		await expect(asMember.getByText('Signed out, not saved')).toBeVisible({ timeout: 5_000 });
		await expect(asMember.getByRole('link', { name: 'Sign in' })).toHaveAttribute(
			'href',
			'/auth/login'
		);

		await asMember.context().addCookies(cookies);
		await asMember.evaluate(() => window.dispatchEvent(new Event('focus')));
		await expect(asMember.getByText('✓ Saved')).toBeVisible({ timeout: 5_000 });

		await asMember.reload();
		await expect(asMember.locator('textarea')).toHaveValue('e2e written while signed out');
	});

	test('photo upload', async ({ asMember }) => {
		await asMember.goto(`/${COMP}/journal/2026-05-02`);
		await waitForHydration(asMember);

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
		await waitForHydration(asMember);

		// Make sure a photo is present; if not, upload one.
		const mediaImg = asMember.locator('img[src*="/api/photos/journal/"]').first();
		const count = await mediaImg.count();
		if (count === 0) {
			const textarea = asMember.locator('textarea');
			await textarea.fill('e2e caption test');
			await asMember.locator('h1').first().click();
			await expect(asMember.getByText('✓ Saved')).toBeVisible({ timeout: 5_000 });

			const fileInput = asMember.locator('input[type="file"][name="photos"]').first();
			await fileInput.setInputFiles(pngUpload());
			await expect(mediaImg).toBeVisible({ timeout: 15_000 });
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
		const mediaContainer = asMember
			.locator('div.group')
			.filter({ has: asMember.locator('img[src*="/api/photos/journal/"]') })
			.first();
		await mediaContainer.hover();

		const deleteBtn = mediaContainer.getByRole('button', { name: 'Delete media' });
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

	test('journal timeline marks today and opens media in the lightbox', async ({ asMember }) => {
		const today = (() => {
			const n = new Date();
			const p = (x: number) => String(x).padStart(2, '0');
			return `${n.getUTCFullYear()}-${p(n.getUTCMonth() + 1)}-${p(n.getUTCDate())}`;
		})();

		// Create today's entry with a photo.
		await asMember.goto(`/${COMP}/journal/${today}`);
		await waitForHydration(asMember);
		await asMember.locator('textarea').first().fill('timeline e2e body');
		await asMember.locator('h1').first().click();
		await expect(asMember.getByText('✓ Saved')).toBeVisible({ timeout: 8_000 });
		const fileInput = asMember.locator('input[type="file"][name="photos"]').first();
		await fileInput.setInputFiles(pngUpload());
		await expect(asMember.locator('img[src*="/api/photos/journal/"]').first()).toBeVisible({
			timeout: 15_000
		});

		// On the list, today's row shows the "Today" marker and the thumbnail opens the lightbox.
		await asMember.goto(`/${COMP}/journal`);
		await expect(asMember.getByText('Today', { exact: true }).first()).toBeVisible({
			timeout: 8_000
		});
		await asMember.locator('img[src*="/api/photos/journal/"]').first().click();
		await expect(asMember.locator('[role="dialog"]')).toBeVisible({ timeout: 5_000 });
	});

	test('timeline shows a day that has activities but no journal entry (#181)', async ({
		asMember
	}) => {
		// Edward's newest seeded journal entry is days old and no spec writes one
		// for today, so today is an activity-only day on his timeline.
		await asMember.goto('/seed-comp-edward/log?type=grooming');
		await asMember.getByRole('button', { name: /^Log / }).click();
		await expect(asMember.getByText(/Activity logged/)).toBeVisible();

		await asMember.goto('/seed-comp-edward/journal');
		await expect(asMember.getByText('Today', { exact: true }).first()).toBeVisible({
			timeout: 8_000
		});
		await expect(asMember.getByRole('button', { name: /grooming/i }).first()).toBeVisible();
	});

	test('journal list shows entries', async ({ asMember }) => {
		await asMember.goto(`/${COMP}/journal`);

		// The seed entry body is rendered as markdown HTML; the raw text will appear
		// inside the prose container
		await expect(asMember.getByText('Clean bill of health')).toBeVisible({ timeout: 8_000 });
	});

	test('edit shows the editor alongside the original author', async ({ asMember, asAdmin }) => {
		const date = '2026-05-20';

		// Member authors the entry.
		await asMember.goto(`/${COMP}/journal/${date}`);
		await waitForHydration(asMember);
		await asMember.locator('textarea').first().fill('authored by member');
		await asMember.locator('h1').first().click();
		await expect(asMember.getByText('✓ Saved')).toBeVisible({ timeout: 8_000 });

		// Admin edits the same entry.
		await asAdmin.goto(`/${COMP}/journal/${date}`);
		await waitForHydration(asAdmin);
		await asAdmin.locator('textarea').first().fill('edited by admin');
		await asAdmin.locator('h1').first().click();
		await expect(asAdmin.getByText('✓ Saved')).toBeVisible({ timeout: 8_000 });

		// List shows both attributions on that entry's card.
		await asMember.goto(`/${COMP}/journal`);
		// Scope to the card containing the edited body text (each entry is a rounded-2xl border card).
		const card = asMember
			.locator('div.rounded-2xl.border.bg-card')
			.filter({ hasText: 'edited by admin' });
		await expect(card.getByText(/by Jet/)).toBeVisible({ timeout: 8_000 });
		await expect(card.getByText(/edited by Spike/)).toBeVisible({ timeout: 8_000 });

		// The day editor page shows the same attribution in its header.
		await asMember.goto(`/${COMP}/journal/${date}`);
		await expect(asMember.getByText(/edited by Spike/).first()).toBeVisible({
			timeout: 8_000
		});
	});

	test('timeline and day page show the day’s health records (#291)', async ({ asMember }) => {
		const stamp = Date.now().toString(36);
		const eventTitle = `e2e-dayitem-event-${stamp}`;
		const docName = `e2e-dayitem-${stamp}.pdf`;
		const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

		// A health event dated today (server-local), a weight and a document.
		await asMember.goto(`/${COMP}/health`);
		await waitForHydration(asMember);
		await asMember.getByRole('button', { name: 'Add Event' }).click();
		await asMember.locator('#title').fill(eventTitle);
		// datetime-local; noon keeps the server-UTC day for any browser offset under 12h
		await asMember.locator('#occurredAt').fill(`${todayUTC()}T12:00`);
		await asMember.locator('select[name="type"]').selectOption('vet_visit');
		await asMember.getByRole('button', { name: 'Save Event' }).click();
		await expect(asMember.getByText(eventTitle)).toBeVisible({ timeout: 8_000 });

		await asMember.getByRole('button', { name: 'Log Weight' }).click();
		await asMember.locator('#weight').fill('27.4');
		await asMember.getByRole('button', { name: 'Log Weight' }).last().click();
		await expect(
			asMember
				.locator('section')
				.filter({ hasText: 'Weight History' })
				.getByText(/27\.4\b/)
		).toBeVisible({ timeout: 8_000 });

		await asMember.goto(`/${COMP}/documents`);
		await waitForHydration(asMember);
		await asMember.locator('input[type="file"]').setInputFiles(pdfUpload(docName));
		await expect(asMember.getByText(docName)).toBeVisible({ timeout: 15_000 });

		// Timeline chips. Located by unique text, never by day number or count.
		await asMember.goto(`/${COMP}/journal`);
		await waitForHydration(asMember);
		const healthChip = asMember.getByRole('button', { name: new RegExp(`^${esc(eventTitle)}`) });
		const weightChip = asMember.getByRole('button', { name: /^27\.4 / });
		const docChip = asMember.getByRole('button', { name: new RegExp(`^${esc(docName)}`) });
		await expect(healthChip).toBeVisible();
		await expect(weightChip).toBeVisible();
		await expect(docChip).toBeVisible();

		// The document chip previews in place.
		await docChip.click();
		await expect(asMember.getByRole('dialog', { name: docName })).toBeVisible({ timeout: 8_000 });
		await asMember.keyboard.press('Escape');
		await expect(asMember.getByRole('dialog', { name: docName })).toHaveCount(0);

		// The health chip opens the detail in place; its link opens the Health Log.
		await healthChip.click();
		const detail = asMember.getByRole('dialog', { name: eventTitle });
		await expect(detail).toBeVisible({ timeout: 8_000 });
		await expect(asMember).toHaveURL(new RegExp(`/${COMP}/journal$`));
		await asMember.keyboard.press('Escape');
		await expect(detail).toHaveCount(0);

		await weightChip.click();
		await expect(asMember.getByRole('dialog').getByText(/27\.4/)).toBeVisible();
		await asMember.keyboard.press('Escape');

		await healthChip.click();
		await asMember.getByRole('link', { name: 'Open in Health Log' }).click();
		await expect(asMember).toHaveURL(new RegExp(`/${COMP}/health`));
		await expect(asMember.locator('[role="dialog"]').getByText(eventTitle)).toBeVisible({
			timeout: 8_000
		});
		await asMember.goBack();
		await expect(asMember).toHaveURL(new RegExp(`/${COMP}/journal$`));
		await expect(healthChip).toBeVisible();

		// The day page lists the event under "Health records".
		await asMember
			.getByTestId('journal-day')
			.filter({ has: healthChip })
			.getByRole('link', { name: 'Edit' })
			.click();
		const section = asMember.getByTestId('day-health-records');
		await expect(section.getByText('Health records')).toBeVisible({ timeout: 8_000 });
		await expect(section.getByText(eventTitle)).toBeVisible();
		await section.getByRole('button', { name: new RegExp(`^${esc(eventTitle)}`) }).click();
		await expect(asMember.getByRole('dialog', { name: eventTitle })).toBeVisible();
	});

	test('Back from a health record keeps days loaded with Load more', async ({ asMember }) => {
		// Ein's seed spans 19 timeline days, under the page size of 20. Three
		// old health events push the timeline onto a second page.
		const stamp = Date.now().toString(36);
		await asMember.goto(`/${COMP}/health`);
		await waitForHydration(asMember);
		for (const daysAgo of [400, 401, 402]) {
			const d = new Date(Date.now() - daysAgo * 86_400_000).toISOString().slice(0, 10);
			const title = `e2e-old-${stamp}-${daysAgo}`;
			await asMember.getByRole('button', { name: 'Add Event' }).click();
			await asMember.locator('#title').fill(title);
			await asMember.locator('#occurredAt').fill(`${d}T12:00`);
			await asMember.getByRole('button', { name: 'Save Event' }).click();
			await expect(asMember.getByText(title)).toBeVisible({ timeout: 8_000 });
		}

		await asMember.goto(`/${COMP}/journal`);
		await waitForHydration(asMember);
		const days = asMember.getByTestId('journal-day');
		const firstPage = await days.count();

		// Load pages until the oldest health chip is rendered.
		const oldChip = asMember.getByRole('button', { name: new RegExp(`^e2e-old-${stamp}-402`) });
		let prev = firstPage;
		for (let i = 0; i < 5 && !(await oldChip.isVisible()); i++) {
			await asMember.getByRole('button', { name: 'Load older entries' }).click();
			await expect.poll(() => days.count()).toBeGreaterThan(prev);
			prev = await days.count();
		}
		await expect(oldChip).toBeVisible();
		const loaded = await days.count();

		await oldChip.click();
		await asMember.getByRole('link', { name: 'Open in Health Log' }).click();
		await expect(asMember.locator('[role="dialog"]')).toBeVisible({ timeout: 8_000 });
		await asMember.goBack();
		await expect(asMember).toHaveURL(new RegExp(`/${COMP}/journal$`));
		await expect(days).toHaveCount(loaded);
		await expect(oldChip).toBeInViewport();
	});

	test('an empty day shows the health records empty state and the link toggle', async ({
		asMember
	}) => {
		const empty = new Date(Date.now() - 3000 * 86_400_000).toISOString().slice(0, 10);
		await asMember.goto(`/${COMP}/journal/${empty}`);
		await waitForHydration(asMember);
		const section = asMember.getByTestId('day-health-records');
		const emptyState = section.getByText('No health records for this day.');
		await expect(emptyState).toBeVisible();

		const toggle = section.getByRole('button', { name: 'Link health event' });
		await toggle.click();
		await expect(section.locator('form[action="?/linkHealth"]')).toBeVisible();
		await expect(emptyState).toBeHidden();
		await section.getByRole('button', { name: 'Cancel' }).click();
		await expect(section.locator('form[action="?/linkHealth"]')).toHaveCount(0);
		await expect(emptyState).toBeVisible();
	});

	test('links an older health event from a day and unlinks it (#291)', async ({ asMember }) => {
		const stamp = Date.now().toString(36);
		const title = `e2e-link-${stamp}`;
		const old = new Date(Date.now() - 30 * 86_400_000).toISOString().slice(0, 10);

		// An older health event this test owns.
		await asMember.goto(`/${COMP}/health`);
		await waitForHydration(asMember);
		await asMember.getByRole('button', { name: 'Add Event' }).click();
		await asMember.locator('#title').fill(title);
		await asMember.locator('#occurredAt').fill(`${old}T12:00`);
		await asMember.getByRole('button', { name: 'Save Event' }).click();
		await expect(asMember.getByText(title)).toBeVisible({ timeout: 8_000 });

		// Type, then link right away: the text must survive the link's refresh.
		await asMember.goto(`/${COMP}/journal/${todayUTC()}`);
		await waitForHydration(asMember);
		const note = `e2e link note ${stamp}`;
		await asMember.locator('textarea').first().fill(note);
		await asMember.getByRole('button', { name: 'Link health event' }).click();
		const select = asMember.locator('#link-health-event');
		const value = await select.locator('option', { hasText: title }).getAttribute('value');
		await select.selectOption(value!);
		await asMember.getByRole('button', { name: 'Link', exact: true }).click();

		const section = asMember.getByTestId('day-health-records');
		const row = section.locator('[data-linked="true"]').filter({ hasText: title });
		await expect(row).toBeVisible({ timeout: 8_000 });
		await asMember.reload();
		await expect(asMember.locator('textarea').first()).toHaveValue(note);

		// Timeline: the chip is marked as linked.
		await asMember.goto(`/${COMP}/journal`);
		await waitForHydration(asMember);
		const chip = asMember.locator('button[data-linked="true"]').filter({ hasText: title });
		await expect(chip).toBeVisible();

		// The health page modal lists the linking day.
		await asMember.goto(`/${COMP}/health`);
		await asMember.getByText(title).first().click();
		await expect(
			asMember.getByTestId('health-detail-journal').locator(`a[href$="/journal/${todayUTC()}"]`)
		).toBeVisible({ timeout: 8_000 });
		await asMember.keyboard.press('Escape');

		// Unlink from the day page.
		await asMember.goto(`/${COMP}/journal/${todayUTC()}`);
		await waitForHydration(asMember);
		await asMember
			.getByTestId('day-health-records')
			.locator('[data-linked="true"]')
			.filter({ hasText: title })
			.click();
		await asMember.getByRole('button', { name: 'Unlink from this day' }).click();
		await expect(
			asMember
				.getByTestId('day-health-records')
				.locator('[data-linked="true"]')
				.filter({ hasText: title })
		).toHaveCount(0);
		await asMember.goto(`/${COMP}/journal`);
		await expect(
			asMember.locator('button[data-linked="true"]').filter({ hasText: title })
		).toHaveCount(0);
	});

	test('switching companion on the same date does not carry the entry text over', async ({
		asMember
	}) => {
		const text = `e2e switch ${Date.now().toString(36)}`;
		await asMember.goto(`/${COMP}/journal/${todayUTC()}`);
		await waitForHydration(asMember);
		await asMember.locator('textarea').first().fill(text);
		await asMember.locator('h1').first().click();
		await expect(asMember.getByText('✓ Saved')).toBeVisible({ timeout: 5_000 });

		await asMember.getByRole('button', { name: 'Switch companion' }).click();
		await asMember
			.getByRole('listbox', { name: 'Switch companion' })
			.getByRole('button', { name: 'Edward' })
			.first()
			.click();
		await expect(asMember).toHaveURL(/\/seed-comp-edward\/journal\//);
		await expect(asMember.locator('textarea').first()).not.toHaveValue(text);
	});
});
