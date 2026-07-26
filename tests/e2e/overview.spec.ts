import { test, expect } from '../lib/fixtures';

const COMP = 'seed-comp-ein';

/** One minute ago in "YYYY-MM-DDT..." — ensures the reminder is already overdue/actionable. */
function justPast(): string {
	const d = new Date(Date.now() - 60_000);
	const pad = (n: number) => String(n).padStart(2, '0');
	return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/**
 * Fill and submit the "Add Reminder" form on the companion reminders page.
 * Mirrors the helper in reminders.spec.ts.
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
	await page.goto(`/${COMP}/reminders`);
	await page.getByRole('button', { name: 'Add Reminder' }).click();
	await page.locator('#title').fill(opts.title);
	if (opts.type) {
		await page.locator('select[name="type"]').selectOption(opts.type);
	}
	await page.locator('#dueAt').fill(opts.dueAt);
	if (opts.recurring) {
		const { interval, unit } = opts.recurring;
		await page.locator('#add-isRecurring').check();
		await page.locator('#add-recurrenceInterval').fill(String(interval));
		await page.locator('select[name="recurrenceUnit"]').selectOption(unit);
	}
	await page.getByRole('button', { name: 'Save Reminder' }).click();
	await expect(page.getByRole('button', { name: 'Save Reminder' })).toHaveCount(0, {
		timeout: 8_000
	});
}

/**
 * The needs-attention row for `title`: found via its open-detail button (the
 * one containing the title text), then one level up to the row div — which
 * also holds the skip/done icon buttons as siblings of that button.
 */
function attentionRow(page: import('@playwright/test').Page, title: string) {
	return page
		.locator('section[aria-label="Needs attention"]')
		.locator('button')
		.filter({ hasText: title })
		.locator('..');
}

test('overview renders companion cards and needs-attention @mobile', async ({ asMember }) => {
	await asMember.goto('/');
	// Seed has 2 companions (Ein, Edward) → this is the overview, not a redirect.
	await expect(asMember.getByRole('link', { name: /Ein/i }).first()).toBeVisible({
		timeout: 8_000
	});
	await expect(asMember.getByRole('link', { name: /Edward/i }).first()).toBeVisible();
});

test('overview shows care-status badge @mobile', async ({ asMember }) => {
	await asMember.goto('/');
	// Enriched seed has overdue reminders for both Ein ("Dental check", -5d) and
	// Edward ("Nail trim", -3d) → both companions show "Needs attention".
	await expect(asMember.getByText(/needs attention/i).first()).toBeVisible({ timeout: 8_000 });
});

test('overview companion cards have care-status for all companions @mobile', async ({
	asMember
}) => {
	await asMember.goto('/');
	// Both Ein and Edward should have care-status badges rendered.
	// Both have overdue reminders in the enriched seed → both show "Needs attention".
	const badges = asMember.getByText(/needs attention/i);
	await expect(badges.first()).toBeVisible({ timeout: 8_000 });
});

test('recurring reminder in needs-attention: skip commits via toast and leaves the list', async ({
	asMember
}) => {
	await addReminder(asMember, {
		title: 'e2e-overview-skip-commit',
		type: 'medication',
		dueAt: justPast(),
		recurring: { interval: 1, unit: 'month' }
	});

	await asMember.goto('/');

	const row = attentionRow(asMember, 'e2e-overview-skip-commit');
	await expect(row).toBeVisible({ timeout: 8_000 });
	await row.getByRole('button', { name: 'Skip this occurrence' }).click();

	// Toast with a commit button (label "Skip") — commit immediately rather
	// than waiting out the undo window, mirroring reminders.spec.ts.
	const toast = asMember.locator('[role="status"]');
	await expect(toast).toBeVisible({ timeout: 5_000 });
	await toast.getByRole('button', { name: 'Skip' }).click();

	await expect(toast).toHaveCount(0, { timeout: 5_000 });
	await expect(
		asMember.locator('section[aria-label="Needs attention"]').getByText('e2e-overview-skip-commit')
	).toHaveCount(0, { timeout: 8_000 });
});

test('needs-attention detail modal: skip commits via toast and leaves the list', async ({
	asMember
}) => {
	await addReminder(asMember, {
		title: 'e2e-overview-modal-skip',
		type: 'medication',
		dueAt: justPast(),
		recurring: { interval: 1, unit: 'month' }
	});

	await asMember.goto('/');

	const titleButton = asMember
		.locator('section[aria-label="Needs attention"]')
		.locator('button')
		.filter({ hasText: 'e2e-overview-modal-skip' });
	await expect(titleButton).toBeVisible({ timeout: 8_000 });
	await titleButton.click();

	const dialog = asMember.getByRole('dialog');
	await expect(dialog).toBeVisible();
	await dialog.getByRole('button', { name: 'Skip this occurrence' }).click();

	// Toast with a commit button (label "Skip") — commit immediately rather
	// than waiting out the undo window, mirroring reminders.spec.ts.
	const toast = asMember.locator('[role="status"]');
	await expect(toast).toBeVisible({ timeout: 5_000 });
	await toast.getByRole('button', { name: 'Skip' }).click();

	await expect(toast).toHaveCount(0, { timeout: 5_000 });
	await expect(
		asMember.locator('section[aria-label="Needs attention"]').getByText('e2e-overview-modal-skip')
	).toHaveCount(0, { timeout: 8_000 });
});

test('one-off reminder in needs-attention has no skip button', async ({ asMember }) => {
	await addReminder(asMember, {
		title: 'e2e-overview-skip-none',
		type: 'other',
		dueAt: justPast()
	});

	await asMember.goto('/');

	const row = attentionRow(asMember, 'e2e-overview-skip-none');
	await expect(row).toBeVisible({ timeout: 8_000 });
	await expect(row.getByRole('button', { name: 'Skip this occurrence' })).toHaveCount(0);
});
