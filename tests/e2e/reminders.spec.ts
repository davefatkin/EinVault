import { test, expect } from '../lib/fixtures';

const COMP = 'seed-comp-ein';
const BASE = `/${COMP}/reminders`;

/**
 * Fill and submit the "Add Reminder" form.
 * `dueAt` must be a valid datetime-local string, e.g. "2099-01-15T10:00".
 * `recurring` is optional; when provided the recurring checkbox is checked and
 * the interval/unit fields are set.
 */
async function addReminder(
	page: import('@playwright/test').Page,
	opts: {
		title: string;
		type?: string;
		dueAt: string;
		recurring?: { interval: number; unit: 'day' | 'week' | 'month' | 'year' };
	}
) {
	await page.getByRole('button', { name: 'Add Reminder' }).click();
	await page.locator('#title').fill(opts.title);
	if (opts.type) {
		await page.locator('select[name="type"]').selectOption(opts.type);
	}
	// The datetime-local input is rendered by SvelteKit's use:localDatetimes action
	// which converts a UTC ISO to local on load. For a fresh (empty) input we can
	// type directly.
	await page.locator('#dueAt').fill(opts.dueAt);

	if (opts.recurring) {
		const { interval, unit } = opts.recurring;
		// The checkbox uses id="{idPrefix}-isRecurring" where idPrefix="add"
		await page.locator('#add-isRecurring').check();
		await page.locator('#add-recurrenceInterval').fill(String(interval));
		await page.locator('select[name="recurrenceUnit"]').selectOption(unit);
	}

	await page.getByRole('button', { name: 'Save Reminder' }).click();
	// Form closes on success — wait for the button to disappear
	await expect(page.getByRole('button', { name: 'Save Reminder' })).toHaveCount(0, {
		timeout: 8_000
	});
}

/** Tomorrow in "YYYY-MM-DDT10:00" (local) — safe for "future" due dates. */
function tomorrow(): string {
	const d = new Date();
	d.setDate(d.getDate() + 1);
	const pad = (n: number) => String(n).padStart(2, '0');
	return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T10:00`;
}

/** One minute ago in "YYYY-MM-DDT..." — ensures the reminder is already overdue/actionable. */
function justPast(): string {
	const d = new Date(Date.now() - 60_000);
	const pad = (n: number) => String(n).padStart(2, '0');
	return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

// Locate the active-reminders section (cards listed before the completed
// <details> element). We use the container div that holds the active cards.
// The Svelte template renders either an empty-state Card or a `div.space-y-3`
// with one Card per active reminder. We scope lookups to the whole page and
// rely on the title text being unique per test (enforced by UNIQUE names).
function activeSection(page: import('@playwright/test').Page) {
	// Active reminders live in one container per urgency group, each marked
	// data-active-group. Completed rows (in <details>) and the detail modal's
	// inner lists are never marked, so this excludes them unambiguously.
	return page.locator('[data-active-group]');
}

function completedSection(page: import('@playwright/test').Page) {
	// The completed reminders are inside a <details> element.
	return page.locator('details');
}

test.describe('reminders', () => {
	test('create one-time reminder appears in active section', async ({ asMember }) => {
		await asMember.goto(BASE);

		await addReminder(asMember, {
			title: 'e2e-rem-once',
			type: 'other',
			dueAt: tomorrow()
		});

		// The new reminder should appear in the active list
		await expect(activeSection(asMember).getByText('e2e-rem-once')).toBeVisible({ timeout: 8_000 });
	});

	test('complete with undo restores reminder to active list', async ({ asMember }) => {
		await asMember.goto(BASE);

		await addReminder(asMember, {
			title: 'e2e-rem-undo',
			type: 'other',
			dueAt: tomorrow()
		});

		await expect(activeSection(asMember).getByText('e2e-rem-undo')).toBeVisible({
			timeout: 8_000
		});

		// Click the Done button for this specific reminder card
		const reminderCard = activeSection(asMember)
			.locator('div')
			.filter({ hasText: 'e2e-rem-undo' })
			.first();
		await reminderCard.getByRole('button', { name: 'Done' }).click();

		// Toast with Undo button should appear
		const toast = asMember.locator('[role="status"]');
		await expect(toast).toBeVisible({ timeout: 5_000 });
		await expect(toast.getByRole('button', { name: 'Undo' })).toBeVisible();

		// Click Undo
		await toast.getByRole('button', { name: 'Undo' }).click();

		// Toast should disappear and the reminder should be back in the active list
		await expect(toast).toHaveCount(0, { timeout: 5_000 });
		await expect(activeSection(asMember).getByText('e2e-rem-undo')).toBeVisible({ timeout: 5_000 });

		// Should not have moved to the completed section
		// (The seed has a pre-existing completed reminder so <details> is always present;
		// check that this specific reminder is absent from it instead.)
		await completedSection(asMember).locator('summary').click();
		await expect(completedSection(asMember).getByText('e2e-rem-undo')).toHaveCount(0);
	});

	test('complete without undo commits to completed section', async ({ asMember }) => {
		await asMember.goto(BASE);

		await addReminder(asMember, {
			title: 'e2e-rem-commit',
			type: 'other',
			dueAt: tomorrow()
		});

		await expect(activeSection(asMember).getByText('e2e-rem-commit')).toBeVisible({
			timeout: 8_000
		});

		// Click Done
		const reminderCard = activeSection(asMember)
			.locator('div')
			.filter({ hasText: 'e2e-rem-commit' })
			.first();
		await reminderCard.getByRole('button', { name: 'Done' }).click();

		// Wait for it to appear in the completed section — timeout must outlast the 7s undo window.
		// The seed has a pre-existing completed reminder so <details> is always present;
		// open it immediately and wait for the specific text to appear inside.
		const completed = completedSection(asMember);
		await completed.locator('summary').click();

		// Reminder should be listed as completed (line-through text)
		await expect(completed.getByText('e2e-rem-commit')).toBeVisible({ timeout: 15_000 });

		// Must be gone from the active section
		await expect(activeSection(asMember).getByText('e2e-rem-commit')).toHaveCount(0);
	});

	test('completing recurring reminder spawns next instance', async ({ asMember }) => {
		await asMember.goto(BASE);

		// Due in the past (1 minute ago) so it is actionable immediately
		await addReminder(asMember, {
			title: 'e2e-rem-rec',
			type: 'other',
			dueAt: justPast(),
			recurring: { interval: 1, unit: 'day' }
		});

		await expect(activeSection(asMember).getByText('e2e-rem-rec')).toBeVisible({
			timeout: 8_000
		});

		// Click Done on the recurring reminder
		const reminderCard = activeSection(asMember)
			.locator('div')
			.filter({ hasText: 'e2e-rem-rec' })
			.first();
		await reminderCard.getByRole('button', { name: 'Done' }).click();

		// Wait past the undo window for the completed instance to appear.
		// The seed has a pre-existing completed reminder so <details> is always present;
		// open it immediately and wait for the specific text to appear inside.
		const completed = completedSection(asMember);
		await completed.locator('summary').click();

		// One completed instance
		await expect(completed.getByText('e2e-rem-rec')).toBeVisible({ timeout: 15_000 });

		// One new active instance (the next occurrence, due tomorrow)
		const activeInstances = activeSection(asMember).getByText('e2e-rem-rec');
		await expect(activeInstances).toHaveCount(1, { timeout: 5_000 });
	});

	test('title required — save blocked when empty', async ({ asMember }) => {
		await asMember.goto(BASE);

		await asMember.getByRole('button', { name: 'Add Reminder' }).click();

		// Leave title empty; fill a valid due date so only the title is missing
		await asMember.locator('#dueAt').fill(tomorrow());

		await asMember.getByRole('button', { name: 'Save Reminder' }).click();

		// Browser HTML `required` constraint prevents submission; form stays open
		const titleInput = asMember.locator('#title');
		const valid = await titleInput.evaluate((el) => (el as HTMLInputElement).validity.valid);
		expect(valid).toBe(false);

		// Save button still visible — no redirect/close
		await expect(asMember.getByRole('button', { name: 'Save Reminder' })).toBeVisible();
	});

	test('overdue and upcoming reminders sort into their urgency groups', async ({ asMember }) => {
		await asMember.goto(BASE);
		await addReminder(asMember, { title: 'e2e-overdue-grp', type: 'other', dueAt: justPast() });
		await addReminder(asMember, { title: 'e2e-upcoming-grp', type: 'other', dueAt: tomorrow() });

		// The group container is the data-active-group div immediately after each header <p>.
		const groupAfter = (label: string) =>
			asMember.locator('p').filter({ hasText: label }).locator('xpath=following-sibling::div[1]');

		await expect(groupAfter('Overdue').getByText('e2e-overdue-grp')).toBeVisible({
			timeout: 8_000
		});
		await expect(groupAfter('Upcoming').getByText('e2e-upcoming-grp')).toBeVisible({
			timeout: 8_000
		});
		// Cross-check: the overdue item is NOT in the upcoming group.
		await expect(groupAfter('Overdue').getByText('e2e-upcoming-grp')).toHaveCount(0);
	});

	test('editing a reminder via the ?edit deep link does not reopen after saving (#133)', async ({
		asMember
	}) => {
		// The dashboard reminder modal's "Edit in Reminders" button links here.
		await asMember.goto(`${BASE}?edit=seed-reminder-1`);

		const titleInput = asMember.locator('#edit-title-seed-reminder-1');
		await expect(titleInput).toBeVisible({ timeout: 8_000 });

		// Save without changing anything so other specs that read this seed
		// reminder's title are unaffected.
		await asMember.getByRole('button', { name: 'Save', exact: true }).click();

		// The inline edit form must close and stay closed. It used to pop right
		// back open because the post-save reload re-fired the ?edit effect.
		await expect(titleInput).toHaveCount(0, { timeout: 8_000 });
		await asMember.waitForTimeout(800);
		await expect(titleInput).toHaveCount(0);
	});

	test('skip recurring reminder resolves it and spawns next occurrence', async ({ asMember }) => {
		await asMember.goto(BASE);

		await addReminder(asMember, {
			title: 'e2e-rem-skip-commit',
			type: 'medication',
			dueAt: justPast(),
			recurring: { interval: 1, unit: 'month' }
		});

		await expect(activeSection(asMember).getByText('e2e-rem-skip-commit')).toBeVisible({
			timeout: 8_000
		});

		// Click Skip on this specific reminder card
		const reminderCard = activeSection(asMember)
			.locator('div')
			.filter({ hasText: 'e2e-rem-skip-commit' })
			.first();
		await reminderCard.getByRole('button', { name: 'Skip this occurrence' }).click();

		// Toast with a commit button (label "Skip") should appear — commit immediately
		// rather than waiting out the undo window (mirrors the complete-with-undo test).
		const toast = asMember.locator('[role="status"]');
		await expect(toast).toBeVisible({ timeout: 5_000 });
		await toast.getByRole('button', { name: 'Skip' }).click();

		// Skipped occurrence lands in the completed section with the Skipped badge.
		// The title span and the badge are siblings under the same row div, so go
		// up from the (unique) title text to that row rather than filtering a
		// broader ancestor by hasText — the completed list's wrapper div holds
		// every completed card, and hasText there matches on aggregated subtree
		// text, so it would not confine the badge lookup to this row.
		const completed = completedSection(asMember);
		await completed.locator('summary').click();
		await expect(completed.getByText('e2e-rem-skip-commit')).toBeVisible({ timeout: 15_000 });
		const skipRow = completed.getByText('e2e-rem-skip-commit').locator('..');
		await expect(skipRow.getByText('Skipped')).toBeVisible();

		// The next occurrence is active again (exactly one active instance).
		const activeInstances = activeSection(asMember).getByText('e2e-rem-skip-commit');
		await expect(activeInstances).toHaveCount(1, { timeout: 5_000 });
	});

	test('skip undo restores the reminder without spawning', async ({ asMember }) => {
		await asMember.goto(BASE);

		await addReminder(asMember, {
			title: 'e2e-rem-skip-undo',
			type: 'other',
			dueAt: justPast(),
			recurring: { interval: 1, unit: 'week' }
		});

		await expect(activeSection(asMember).getByText('e2e-rem-skip-undo')).toBeVisible({
			timeout: 8_000
		});

		const reminderCard = activeSection(asMember)
			.locator('div')
			.filter({ hasText: 'e2e-rem-skip-undo' })
			.first();
		await reminderCard.getByRole('button', { name: 'Skip this occurrence' }).click();

		// Toast with Undo button should appear
		const toast = asMember.locator('[role="status"]');
		await expect(toast).toBeVisible({ timeout: 5_000 });
		await expect(toast.getByRole('button', { name: 'Undo' })).toBeVisible();

		// Click Undo
		await toast.getByRole('button', { name: 'Undo' }).click();

		// Toast should disappear and the reminder should be back in the active list,
		// with no next occurrence spawned (still exactly one active instance).
		await expect(toast).toHaveCount(0, { timeout: 5_000 });
		await expect(activeSection(asMember).getByText('e2e-rem-skip-undo')).toBeVisible({
			timeout: 5_000
		});
		await expect(activeSection(asMember).getByText('e2e-rem-skip-undo')).toHaveCount(1);

		// Should not have moved to the completed section.
		await completedSection(asMember).locator('summary').click();
		await expect(completedSection(asMember).getByText('e2e-rem-skip-undo')).toHaveCount(0);
	});

	test('one-off reminder has no skip button', async ({ asMember }) => {
		await asMember.goto(BASE);

		await addReminder(asMember, { title: 'e2e-rem-skip-none', type: 'other', dueAt: tomorrow() });

		await expect(activeSection(asMember).getByText('e2e-rem-skip-none')).toBeVisible({
			timeout: 8_000
		});

		const reminderCard = activeSection(asMember)
			.locator('div')
			.filter({ hasText: 'e2e-rem-skip-none' })
			.first();
		await expect(reminderCard.getByRole('button', { name: 'Skip this occurrence' })).toHaveCount(0);
	});

	test('restoring a skipped reminder that was edited into recurring (null seriesId)', async ({
		asMember
	}) => {
		await asMember.goto(BASE);

		// Create as a plain one-off — its seriesId stays null even after the
		// edit below flips isRecurring on, since the update action never sets it.
		await addReminder(asMember, {
			title: 'e2e-rem-restore-null-series',
			type: 'medication',
			dueAt: justPast()
		});

		await expect(
			activeSection(asMember).getByText('e2e-rem-restore-null-series')
		).toBeVisible({ timeout: 8_000 });

		// Edit it into a recurring reminder (see the ?edit deep-link test above
		// for the same inline-edit shape).
		const reminderCard = activeSection(asMember)
			.locator('div')
			.filter({ hasText: 'e2e-rem-restore-null-series' })
			.first();
		await reminderCard.getByRole('button', { name: 'Edit' }).click();

		// Only one edit form is ever open at a time (editingId is a single
		// value), so these dynamic-id fields are unambiguous on the page.
		await asMember.locator('input[id$="-isRecurring"]').check();
		await asMember.locator('input[id$="-recurrenceInterval"]').fill('1');
		await asMember.locator('select[name="recurrenceUnit"]').selectOption('week');
		await asMember.getByRole('button', { name: 'Save', exact: true }).click();

		// Save closes the edit form; the recurring badge confirms the update landed.
		await expect(
			activeSection(asMember).getByText('e2e-rem-restore-null-series')
		).toBeVisible({ timeout: 8_000 });

		// Skip it and commit immediately via the toast (mirrors the skip-commit test).
		const skipCard = activeSection(asMember)
			.locator('div')
			.filter({ hasText: 'e2e-rem-restore-null-series' })
			.first();
		await skipCard.getByRole('button', { name: 'Skip this occurrence' }).click();
		const toast = asMember.locator('[role="status"]');
		await expect(toast).toBeVisible({ timeout: 5_000 });
		await toast.getByRole('button', { name: 'Skip' }).click();

		// Skipped instance lands in the completed section; the spawned next
		// occurrence is active — exactly one active instance.
		const completed = completedSection(asMember);
		await completed.locator('summary').click();
		await expect(completed.getByText('e2e-rem-restore-null-series')).toBeVisible({
			timeout: 15_000
		});
		await expect(
			activeSection(asMember).getByText('e2e-rem-restore-null-series')
		).toHaveCount(1, { timeout: 5_000 });

		// Restore the skipped (completed) row — this must delete the spawned
		// future instance even though the original reminder's seriesId is null.
		// The title span and the action buttons are cousins (both children of the
		// row's outer flex container), so go up two levels from the title text —
		// one level only reaches the text-row div the badge check above used.
		const completedRow = completed
			.getByText('e2e-rem-restore-null-series')
			.locator('..')
			.locator('..');
		await completedRow.getByRole('button', { name: 'Restore' }).click();

		// Restored row is back in the active section, and the spawned occurrence
		// is gone — exactly one active instance again.
		await expect(
			activeSection(asMember).getByText('e2e-rem-restore-null-series')
		).toBeVisible({ timeout: 8_000 });
		await expect(
			activeSection(asMember).getByText('e2e-rem-restore-null-series')
		).toHaveCount(1, { timeout: 5_000 });

		// No longer listed in the completed section.
		await expect(completed.getByText('e2e-rem-restore-null-series')).toHaveCount(0, {
			timeout: 5_000
		});
	});

	test('caretaker can skip a recurring reminder during their shift', async ({
		asMember,
		asCaretaker
	}) => {
		// seed-reminder-recurring is due outside the active shift window, and the
		// only in-shift seed reminder (seed-reminder-6) is non-recurring, so the
		// care dashboard never surfaces a seeded skippable reminder. Create one
		// via the member page with a due date inside the shift window instead.
		await asMember.goto(BASE);
		await addReminder(asMember, {
			title: 'e2e-rem-skip-caretaker',
			type: 'medication',
			dueAt: justPast(),
			recurring: { interval: 1, unit: 'month' }
		});

		await asCaretaker.goto(`/care/${COMP}`);

		const remindersSection = asCaretaker
			.locator('section')
			.filter({ hasText: 'Upcoming Reminders' });
		await expect(remindersSection.getByText('e2e-rem-skip-caretaker')).toBeVisible({
			timeout: 8_000
		});

		// Other recurring reminders can be left active in-shift by earlier tests
		// in this worker (they share one server/DB for the whole spec file), so
		// scope to this row specifically rather than any Skip button in the
		// section: title span -> its button -> the row div.
		const row = remindersSection.getByText('e2e-rem-skip-caretaker').locator('..').locator('..');
		await row.getByRole('button', { name: 'Skip this occurrence' }).click();

		// Commit immediately via the toast's commit button (label "Skip").
		const toast = asCaretaker.locator('[role="status"]');
		await expect(toast).toBeVisible({ timeout: 5_000 });
		await toast.getByRole('button', { name: 'Skip' }).click();

		// Toast clears and the row leaves the upcoming list (next occurrence is
		// a month out, well outside the shift window).
		await expect(toast).toHaveCount(0, { timeout: 5_000 });
		await expect(remindersSection.getByText('e2e-rem-skip-caretaker')).toHaveCount(0, {
			timeout: 8_000
		});
	});
});
