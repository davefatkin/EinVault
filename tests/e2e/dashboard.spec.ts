import { test, expect } from '../lib/fixtures';

const COMP = 'seed-comp-ein';

/**
 * Ten days ago — guarantees first position under the Upcoming Reminders
 * card's ascending-dueAt sort + slice(0,5), regardless of other overdue
 * reminders that earlier specs sharing this worker's DB may have left behind
 * (the most-overdue seed reminder, "Dental check", is only 5 days overdue).
 */
function wayPast(): string {
	const d = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000);
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
 * The Upcoming Reminders card row for `title`: found via its open-detail
 * button (the one containing the title text), then one level up to the row
 * div — which also holds the skip/done icon buttons as siblings of that
 * button.
 */
function reminderRow(page: import('@playwright/test').Page, title: string) {
	return page.locator('button').filter({ hasText: title }).locator('..');
}

/**
 * Matches the row's open-detail button only while it still shows the
 * "Overdue" due-chip for `title`. Skipping a recurring reminder spawns its
 * next occurrence under the same title (due a full interval out), so the
 * title itself doesn't disappear from the card — the overdue instance
 * resolving is what we can assert.
 */
function overdueRow(page: import('@playwright/test').Page, title: string) {
	return page.locator('button').filter({ hasText: title }).filter({ hasText: 'Overdue' });
}

test('companion dashboard renders hero and cards @mobile', async ({ asMember }) => {
	await asMember.goto(`/${COMP}`);
	await expect(asMember.getByRole('heading', { name: /Ein/i })).toBeVisible({ timeout: 8_000 });
	await expect(asMember.getByText(/upcoming reminders/i)).toBeVisible({ timeout: 8_000 });
});

test('mobile FAB deep-link hrefs @mobile', async ({ asMember }, testInfo) => {
	test.skip(testInfo.project.name !== 'mobile', 'FAB is mobile-only');
	await asMember.goto(`/${COMP}`);
	await asMember.getByRole('button', { name: 'Quick add' }).click();
	await expect(asMember.getByRole('link', { name: 'Add reminder' })).toHaveAttribute(
		'href',
		`/${COMP}/reminders?new=1`
	);
	await expect(asMember.getByRole('link', { name: 'Record weight' })).toHaveAttribute(
		'href',
		`/${COMP}/health?new=weight`
	);
	await expect(asMember.getByRole('link', { name: 'Log health event' })).toHaveAttribute(
		'href',
		`/${COMP}/health?new=1`
	);
});

// Regression: the mobile quick-add FAB's "Add journal entry" must point at
// today's journal day (YYYY-MM-DD), not /journal/new (which 400s on date parse).
test('mobile quick-add journal links to today, not /new @mobile', async ({
	asMember
}, testInfo) => {
	test.skip(testInfo.project.name !== 'mobile', 'FAB is mobile-only');
	await asMember.goto(`/${COMP}`);
	await asMember.getByRole('button', { name: 'Quick add' }).click();
	const link = asMember.getByRole('link', { name: 'Add journal entry' });
	await expect(link).toHaveAttribute('href', new RegExp(`/${COMP}/journal/\\d{4}-\\d{2}-\\d{2}$`));
	// Following it loads a real journal day (not a 400).
	await link.click();
	await expect(asMember).toHaveURL(new RegExp(`/${COMP}/journal/\\d{4}-\\d{2}-\\d{2}$`), {
		timeout: 8_000
	});
	await expect(asMember.locator('textarea').first()).toBeVisible({ timeout: 8_000 });
});

// Documents has no bottom-nav tab on mobile; it must still be reachable from the
// companion top bar.
test('mobile exposes Documents on a companion page @mobile', async ({ asMember }, testInfo) => {
	test.skip(testInfo.project.name !== 'mobile', 'top-bar Documents link is mobile-only');
	await asMember.goto(`/${COMP}`);
	const docs = asMember.getByRole('link', { name: /documents/i });
	await expect(docs.first()).toHaveAttribute('href', `/${COMP}/documents`);
	await docs.first().click();
	await expect(asMember).toHaveURL(`/${COMP}/documents`, { timeout: 8_000 });
});

// The "Next vet" hero stat surfaces the soonest vet/vaccination reminder.
// It should open that reminder's detail modal, like the sibling weight stat.
test('Next vet stat opens the reminder detail modal (#143)', async ({ asMember }) => {
	await asMember.goto(`/${COMP}`);

	// seed-reminder-overdue: "Dental check" is the soonest vet reminder for Ein
	// (overdue by 5 days, so it sorts first among vet/vaccination reminders).
	const nextVet = asMember.getByRole('button', { name: 'Dental check', exact: true });
	await expect(nextVet).toBeVisible({ timeout: 8_000 });
	await nextVet.click();

	const dialog = asMember.getByRole('dialog');
	await expect(dialog).toBeVisible();
	await expect(dialog.getByRole('heading', { name: 'Dental check' })).toBeVisible();
});

test('skip recurring reminder on the dashboard card commits and leaves the list', async ({
	asMember
}) => {
	await addReminder(asMember, {
		title: 'e2e-dash-skip-commit',
		type: 'medication',
		dueAt: wayPast(),
		recurring: { interval: 1, unit: 'month' }
	});

	await asMember.goto(`/${COMP}`);
	const row = reminderRow(asMember, 'e2e-dash-skip-commit');
	await expect(row).toBeVisible({ timeout: 8_000 });
	await row.getByRole('button', { name: 'Skip this occurrence' }).click();

	// Toast with a commit button (label "Skip") — commit immediately rather
	// than waiting out the undo window, mirroring reminders.spec.ts.
	const toast = asMember.locator('[role="status"]');
	await expect(toast).toBeVisible({ timeout: 5_000 });
	await toast.getByRole('button', { name: 'Skip' }).click();

	await expect(toast).toHaveCount(0, { timeout: 5_000 });
	// The overdue instance resolved; only the freshly spawned (future-dated)
	// occurrence of the same title may remain.
	await expect(overdueRow(asMember, 'e2e-dash-skip-commit')).toHaveCount(0, { timeout: 8_000 });
});

test('skip from the reminder detail modal commits and leaves the card', async ({ asMember }) => {
	await addReminder(asMember, {
		title: 'e2e-dash-skip-modal',
		type: 'medication',
		dueAt: wayPast(),
		// Interval must outrun wayPast()'s 10-day offset so the spawned next
		// occurrence lands in the future (not still overdue) — see overdueRow.
		recurring: { interval: 1, unit: 'month' }
	});

	await asMember.goto(`/${COMP}`);
	const row = reminderRow(asMember, 'e2e-dash-skip-modal');
	await expect(row).toBeVisible({ timeout: 8_000 });
	await row.locator('button').first().click();

	const dialog = asMember.getByRole('dialog');
	await expect(dialog).toBeVisible({ timeout: 5_000 });
	await expect(dialog.getByRole('heading', { name: 'e2e-dash-skip-modal' })).toBeVisible();
	await dialog.getByRole('button', { name: 'Skip this occurrence' }).click();

	const toast = asMember.locator('[role="status"]');
	await expect(toast).toBeVisible({ timeout: 5_000 });
	await toast.getByRole('button', { name: 'Skip' }).click();

	await expect(toast).toHaveCount(0, { timeout: 5_000 });
	// The overdue instance resolved; only the freshly spawned (future-dated)
	// occurrence of the same title may remain.
	await expect(overdueRow(asMember, 'e2e-dash-skip-modal')).toHaveCount(0, { timeout: 8_000 });
});

test('one-off reminder on the dashboard has no skip button in list or modal', async ({
	asMember
}) => {
	await addReminder(asMember, {
		title: 'e2e-dash-skip-none',
		type: 'other',
		dueAt: wayPast()
	});

	await asMember.goto(`/${COMP}`);
	const row = reminderRow(asMember, 'e2e-dash-skip-none');
	await expect(row).toBeVisible({ timeout: 8_000 });
	await expect(row.getByRole('button', { name: 'Skip this occurrence' })).toHaveCount(0);

	await row.locator('button').first().click();
	const dialog = asMember.getByRole('dialog');
	await expect(dialog).toBeVisible({ timeout: 5_000 });
	await expect(dialog.getByRole('button', { name: 'Skip this occurrence' })).toHaveCount(0);
});

test.describe('mood trend card', () => {
	test('7-day strip renders seeded moods @mobile', async ({ asMember }) => {
		await asMember.goto(`/${COMP}`);
		const card = asMember.getByTestId('mood-trend');
		await expect(card.locator('a[data-date]')).toHaveCount(7);
		await expect(card.locator('a[data-date]:not([data-mood="none"])')).not.toHaveCount(0);
		await expect(card.getByRole('button', { name: 'Show 7 days' })).toHaveAttribute(
			'aria-pressed',
			'true'
		);
	});

	test('range choice persists across reloads @mobile', async ({ asMember }) => {
		const card = asMember.getByTestId('mood-trend');
		const saveRange = async (days: number) => {
			const saved = asMember.waitForResponse(
				(r) => r.url().includes('setMoodTrendDays') && r.request().method() === 'POST'
			);
			await card.getByRole('button', { name: `Show ${days} days` }).click();
			await saved;
		};

		await asMember.goto(`/${COMP}`);
		try {
			await saveRange(90);
			await expect(card.locator('a[data-date]')).toHaveCount(90);
			await expect(card.getByText('No entry')).toBeVisible();

			await asMember.reload();
			await expect(card.locator('a[data-date]')).toHaveCount(90);
			await expect(card.getByRole('button', { name: 'Show 90 days' })).toHaveAttribute(
				'aria-pressed',
				'true'
			);

			// No horizontal page scroll with the widest grid.
			const overflows = await asMember.evaluate(
				() => document.documentElement.scrollWidth > window.innerWidth
			);
			expect(overflows).toBe(false);
		} finally {
			// Shared asMember user: always restore the default for later tests.
			await asMember.goto(`/${COMP}`);
			await saveRange(7);
		}
	});

	test('clicking a day opens that journal day', async ({ asMember }) => {
		await asMember.goto(`/${COMP}`);
		const cell = asMember.getByTestId('mood-trend').locator('a[data-date]').first();
		const date = await cell.getAttribute('data-date');
		expect(date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
		await cell.click();
		await expect(asMember).toHaveURL(new RegExp(`/${COMP}/journal/${date}$`));
	});

	test('companion without moods shows the empty state', async ({ asMember }) => {
		await asMember.goto('/companions/new');
		await asMember.locator('#name').fill('e2e-mood-empty');
		await asMember.getByRole('button', { name: 'Add Companion' }).click();
		await expect(asMember).not.toHaveURL(/\/companions\/new/, { timeout: 10_000 });

		const card = asMember.getByTestId('mood-trend');
		await expect(card.getByText('No moods logged yet')).toBeVisible();
		await expect(card.getByRole('link', { name: "Log today's mood" })).toBeVisible();
		await expect(card.locator('a[data-date]')).toHaveCount(0);
	});
});
