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
		await expect(completedSection(asMember)).toHaveCount(0);
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

		// Wait for it to appear in the completed section — timeout must outlast the 7s undo window
		const completed = completedSection(asMember);
		await expect(completed).toBeVisible({ timeout: 15_000 });

		// Open the <details> summary to see the completed list
		await completed.locator('summary').click();

		// Reminder should be listed as completed (line-through text)
		await expect(completed.getByText('e2e-rem-commit')).toBeVisible({ timeout: 5_000 });

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

		// Wait past the undo window for the completed instance to appear
		const completed = completedSection(asMember);
		await expect(completed).toBeVisible({ timeout: 15_000 });

		// Open the completed <details>
		await completed.locator('summary').click();

		// One completed instance
		await expect(completed.getByText('e2e-rem-rec')).toBeVisible({ timeout: 5_000 });

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
});
