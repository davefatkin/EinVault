import { test, expect } from '../lib/fixtures';
import { test as base, expect as baseExpect } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';
import { createSeededDb, SEED } from '../lib/seed';
import { startAppServer, type AppServer } from '../lib/app-server';
import { noonZone } from '../lib/dates';
import { waitForHydration } from '../lib/hydration';
import { createIncidentViaUi, deleteIncidentViaUi } from '../lib/incidents';
import { createCompanionViaUi, deleteCompanionByName } from '../lib/companions';
import { insertMedication, deleteMedications, dosesFor } from '../lib/medications';

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
	await waitForHydration(page);
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
	await waitForHydration(asMember);
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
	await waitForHydration(asMember);
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
	await waitForHydration(asMember);
	const docs = asMember.getByRole('link', { name: /documents/i });
	await expect(docs.first()).toHaveAttribute('href', `/${COMP}/documents`);
	await docs.first().click();
	await expect(asMember).toHaveURL(`/${COMP}/documents`, { timeout: 8_000 });
});

// The "Next vet" hero stat surfaces the soonest vet/vaccination reminder.
// It should open that reminder's detail modal, like the sibling weight stat.
test('Next vet stat opens the reminder detail modal (#143)', async ({ asMember }) => {
	await asMember.goto(`/${COMP}`);
	await waitForHydration(asMember);

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
	await waitForHydration(asMember);
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
	await waitForHydration(asMember);
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
	await waitForHydration(asMember);
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
		await expect(card.getByRole('button', { name: '7d', exact: true })).toHaveAttribute(
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
			await card.getByRole('button', { name: `${days}d`, exact: true }).click();
			await saved;
		};

		await asMember.goto(`/${COMP}`);
		await waitForHydration(asMember);
		try {
			await saveRange(90);
			await expect(card.locator('a[data-date]')).toHaveCount(90);
			await expect(card.getByText('No entry')).toBeVisible();

			await asMember.reload();
			await expect(card.locator('a[data-date]')).toHaveCount(90);
			await expect(card.getByRole('button', { name: '90d', exact: true })).toHaveAttribute(
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
			await waitForHydration(asMember);
			await saveRange(7);
		}
	});

	test('clicking a day opens that journal day', async ({ asMember }) => {
		await asMember.goto(`/${COMP}`);
		await waitForHydration(asMember);
		const cell = asMember.getByTestId('mood-trend').locator('a[data-date]').first();
		const date = await cell.getAttribute('data-date');
		expect(date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
		await cell.click();
		await expect(asMember).toHaveURL(new RegExp(`/${COMP}/journal/${date}$`));
	});

	test('companion without moods shows the empty state', async ({ asMember }) => {
		await asMember.goto('/companions/new');
		await waitForHydration(asMember);
		await asMember.locator('#name').fill('e2e-mood-empty');
		await asMember.getByRole('button', { name: 'Add Companion' }).click();
		await expect(asMember).not.toHaveURL(/\/companions\/new/, { timeout: 10_000 });

		const card = asMember.getByTestId('mood-trend');
		await expect(card.getByText('No moods logged yet')).toBeVisible();
		await expect(card.getByRole('link', { name: "Log today's mood" })).toBeVisible();
		await expect(card.locator('a[data-date]')).toHaveCount(0);
	});

	test('archived companion hides the log-mood CTA', async ({ asAdmin }) => {
		await asAdmin.goto('/companions/new');
		await waitForHydration(asAdmin);
		await asAdmin.locator('#name').fill('e2e-mood-archived');
		await asAdmin.getByRole('button', { name: 'Add Companion' }).click();
		await expect(asAdmin).not.toHaveURL(/\/companions\/new/, { timeout: 10_000 });
		const id = asAdmin.url().split('/').filter(Boolean).pop()!;

		const card = asAdmin.getByTestId('mood-trend');
		await expect(card.getByRole('link', { name: "Log today's mood" })).toBeVisible();
		// A new companion gets the add prompts; an archived one does not.
		const addPrompts = asAdmin.getByTestId(/^dashboard-(medications|supplies)-empty$/);
		await expect(addPrompts).toHaveCount(2);

		// Archive the companion via the real UI flow (see companions.spec.ts).
		await asAdmin.goto(`/companions/${id}/edit`);
		await waitForHydration(asAdmin);
		const triggerBtn = asAdmin.getByRole('button', { name: /Archive e2e-mood-archived/i });
		await triggerBtn.scrollIntoViewIfNeeded();
		await triggerBtn.click();
		const archiveForm = asAdmin.locator('form[action="?/archive"]');
		await expect(archiveForm).toBeVisible({ timeout: 5_000 });
		await archiveForm.locator('button[type="submit"]').click();
		await expect(asAdmin).toHaveURL(/\/admin\/companions/, { timeout: 10_000 });

		await asAdmin.goto(`/${id}`);
		await expect(card.getByText('No moods logged yet')).toBeVisible();
		await expect(card.getByRole('link', { name: "Log today's mood" })).toHaveCount(0);
		await expect(addPrompts).toHaveCount(0);
	});
});

test('the age tooltip opens on tap and closes on Escape @mobile', async ({ asMember }) => {
	await asMember.goto(`/${COMP}`);
	await waitForHydration(asMember);
	const trigger = asMember.getByTestId('companion-meta').getByRole('button', { name: /~\d+y old/ });
	const tip = asMember.getByText('Approximate birth date', { exact: true });
	await expect(tip).toBeHidden();
	await trigger.click();
	await expect(tip).toBeVisible();
	// The popover sits in the viewport, not clipped off-screen.
	const box = await tip.boundingBox();
	const vp = asMember.viewportSize()!;
	expect(box).not.toBeNull();
	expect(box!.x).toBeGreaterThanOrEqual(0);
	expect(box!.x + box!.width).toBeLessThanOrEqual(vp.width);
	await asMember.keyboard.press('Escape');
	await expect(tip).toBeHidden();
});

test('open incident banner shows on the companion dashboard and disappears when resolved @mobile', async ({
	asMember
}) => {
	const title = `e2e-dash-inc-${Date.now().toString(36)}`;
	const banner = asMember.getByRole('region', { name: 'Open incidents' });
	let id: string | undefined;
	try {
		await asMember.goto(`/${COMP}`);
		await expect(asMember.getByRole('heading', { name: /Ein/i })).toBeVisible();
		await expect(banner).toHaveCount(0);

		id = await createIncidentViaUi(asMember, COMP, { title, severity: 'severe' });
		await asMember.goto(`/${COMP}`);
		await expect(banner).toContainText(title);
		await expect(banner).toContainText('Severe');
		await expect(banner).toContainText('Day 1');
		await banner.getByRole('link', { name: new RegExp(title) }).click();
		await expect(asMember).toHaveURL(new RegExp(`/${COMP}/health/incidents/${id}$`));

		await waitForHydration(asMember);
		await asMember.getByRole('button', { name: 'Mark resolved' }).click();
		await asMember.getByRole('dialog').getByRole('button', { name: 'Mark resolved' }).click();
		await expect(asMember.getByTestId('incident-status')).toContainText('Resolved');

		await asMember.goto(`/${COMP}`);
		await expect(asMember.getByRole('heading', { name: /Ein/i })).toBeVisible();
		await expect(banner).toHaveCount(0);
	} finally {
		if (id) await deleteIncidentViaUi(asMember, COMP, id);
	}
});

test('a recent incident on the dashboard opens the incident page', async ({ asMember }) => {
	const title = `e2e-dash-recent-${Date.now().toString(36)}`;
	let id: string | undefined;
	try {
		id = await createIncidentViaUi(asMember, COMP, { title });
		await asMember.goto(`/${COMP}`);
		await waitForHydration(asMember);
		// The recent activity row (type label first), not the banner's link.
		await asMember.getByRole('link', { name: new RegExp(`^Incident ${title}`) }).click();
		await expect(asMember).toHaveURL(new RegExp(`/${COMP}/health/incidents/${id}$`));
		await expect(asMember.getByRole('heading', { level: 1, name: title })).toBeVisible();
	} finally {
		if (id) await deleteIncidentViaUi(asMember, COMP, id);
	}
});

test('the default seeded world shows no celebrations banner', async ({ asAdmin }) => {
	await asAdmin.goto('/');
	await waitForHydration(asAdmin);
	await expect(asAdmin.getByRole('heading', { level: 1 })).toBeVisible();
	await expect(asAdmin.getByRole('region', { name: 'Celebrations' })).toHaveCount(0);
});

const REPO_ROOT = path.resolve(import.meta.dirname, '../..');

const celebrate = base.extend<{ world: AppServer }>({
	// eslint-disable-next-line no-empty-pattern
	world: async ({}, use, testInfo) => {
		const dir = path.join(
			REPO_ROOT,
			'.test-data',
			`celebrate-${testInfo.workerIndex}-${testInfo.testId}`
		);
		const dbPath = createSeededDb(dir);
		// Homecoming anniversary today, four years home (year shift keeps Feb 29 valid).
		const { tz, today } = noonZone();
		const [y, m, d] = today.split('-');
		const raw = new Database(dbPath);
		raw
			.prepare('UPDATE companions SET homecoming_date = ? WHERE id = ?')
			.run(`${Number(y) - 4}-${m}-${d}`, SEED.companions.edward.id);
		raw.close();
		const server = await startAppServer({ dbPath, env: { TZ: tz } });
		await use(server);
		await server.stop();
		fs.rmSync(dir, { recursive: true, force: true });
	}
});

celebrate(
	'celebration banner shows on both pages and dismisses per browser',
	async ({ world, page }) => {
		const base = world.baseURL;
		await page.goto(base + '/auth/login');
		await page.getByLabel('Username').fill(SEED.admin.username);
		await page.getByLabel('Password').fill(SEED.password);
		await page.getByRole('button', { name: 'Sign in' }).click();
		await baseExpect(page.getByLabel('Username')).toHaveCount(0, { timeout: 10_000 });

		const text = "Edward's homecoming day: 4 years home!";
		const banner = page.getByRole('region', { name: 'Celebrations' });

		await page.goto(base + '/');
		await waitForHydration(page);
		await baseExpect(banner.getByText(text)).toBeVisible();
		await baseExpect(banner.getByRole('heading')).toHaveCount(0);
		// On the overview the text links to the companion; the emoji stays outside the link.
		const link = banner.getByRole('link', { name: text, exact: true });
		await baseExpect(link).toHaveAttribute('href', `/${SEED.companions.edward.id}`);
		await baseExpect(link).toHaveText(text);

		await page.goto(`${base}/${SEED.companions.ein.id}`);
		await baseExpect(banner).toHaveCount(0);

		await page.goto(`${base}/${SEED.companions.edward.id}`);
		await waitForHydration(page);
		await baseExpect(banner.getByText(text)).toBeVisible();
		// Already on Edward's dashboard: no link back to it.
		await baseExpect(banner.getByRole('link')).toHaveCount(0);
		await banner.getByRole('button', { name: 'Dismiss Edward' }).click();
		await baseExpect(banner).toHaveCount(0);

		await page.reload();
		await baseExpect(banner).toHaveCount(0);
		await page.goto(base + '/');
		await baseExpect(page.getByRole('heading', { level: 1 })).toBeVisible();
		await baseExpect(banner).toHaveCount(0);
	}
);

test('medications card shows active medications with Given, and prompts to add one without any @mobile', async ({
	app,
	asMember
}) => {
	const active = 'e2e-dash-med';
	const ended = 'e2e-dash-med-ended';
	const card = asMember.getByTestId('dashboard-medications');
	const ids: string[] = [];
	// A fresh companion, so the zero-state prompt never depends on what other specs left on Ein.
	const petName = `e2e-dash-meds-${Date.now()}`;
	try {
		const comp = await createCompanionViaUi(asMember, petName);
		await asMember.goto(`/${comp}`);
		await expect(asMember.getByRole('heading', { name: petName })).toBeVisible();
		await expect(card).toHaveCount(0);

		// With none at all, a quiet prompt opens the Medications add form.
		const empty = asMember.getByTestId('dashboard-medications-empty');
		await waitForHydration(asMember);
		await empty.getByRole('link', { name: 'Add medication' }).click();
		await expect(asMember).toHaveURL(new RegExp(`/${comp}/medications$`), { timeout: 8_000 });
		await expect(asMember.getByRole('button', { name: 'Save medication' })).toBeVisible();

		// An ended medication alone hides the prompt and shows no card.
		ids.push(
			insertMedication(app.dataDir, { companionId: comp, name: ended, endedOn: '2020-01-01' })
		);
		await asMember.goto(`/${comp}`);
		await expect(asMember.getByRole('heading', { name: petName })).toBeVisible();
		await expect(empty).toHaveCount(0);
		await expect(card).toHaveCount(0);

		const id = insertMedication(app.dataDir, { companionId: comp, name: active, dose: '2 ml' });
		ids.push(id);
		await asMember.goto(`/${comp}`);
		await waitForHydration(asMember);
		await expect(card.getByText(active, { exact: true })).toBeVisible();
		await expect(card.getByText('2 ml')).toBeVisible();
		await expect(card.getByText(ended)).toHaveCount(0);

		await card.getByRole('button', { name: 'Given' }).click();
		await expect(asMember.getByText(/Dose of .* logged/).first()).toBeVisible({ timeout: 8_000 });
		await expect.poll(() => dosesFor(app.dataDir, id).length).toBe(1);
		expect(dosesFor(app.dataDir, id)[0].givenBy).toBe(SEED.member.id);
	} finally {
		deleteMedications(app.dataDir, ids);
		deleteCompanionByName(app.dataDir, petName);
	}
});

test('a dose reminder links to its medication in the dashboard detail and when completed', async ({
	app,
	asMember
}) => {
	// A fresh companion, so its only reminders are the two below.
	const petName = `e2e-dose-link-${Date.now()}`;
	const medName = `${petName}-med`;
	const ids: string[] = [];
	try {
		const comp = await createCompanionViaUi(asMember, petName);
		const medId = insertMedication(app.dataDir, { companionId: comp, name: medName });
		ids.push(medId);
		const now = Math.floor(Date.now() / 1000);
		const sqlite = new Database(path.join(app.dataDir, 'einvault.db'));
		try {
			const insert = sqlite.prepare(
				`INSERT INTO reminders (id, companion_id, title, type, due_at, completed_at, outcome, medication_id)
				 VALUES (?, ?, ?, 'medication', ?, ?, ?, ?)`
			);
			insert.run(`${petName}-open`, comp, `${petName} open`, now + 2 * 86400, null, null, medId);
			insert.run(`${petName}-done`, comp, `${petName} done`, now - 86400, now, 'completed', medId);
		} finally {
			sqlite.close();
		}
		const medHref = `/${comp}/medications/${medId}`;

		// The dashboard's reminder detail links to the medication.
		await asMember.goto(`/${comp}`);
		await waitForHydration(asMember);
		await reminderRow(asMember, `${petName} open`)
			.getByRole('button', { name: new RegExp(`${petName} open`) })
			.click();
		const detail = asMember.getByRole('dialog');
		await expect(detail.getByRole('link', { name: `Medication: ${medName}` })).toHaveAttribute(
			'href',
			medHref
		);

		// So does the completed reminder on the reminders page.
		await asMember.goto(`/${comp}/reminders`);
		await waitForHydration(asMember);
		const completed = asMember
			.locator('details')
			.filter({ has: asMember.locator('#completed-sort') });
		await completed.locator('summary').click();
		await expect(completed.getByText(`${petName} done`)).toBeVisible();
		await expect(completed.getByRole('link', { name: `Medication: ${medName}` })).toHaveAttribute(
			'href',
			medHref
		);
	} finally {
		deleteMedications(app.dataDir, ids);
		deleteCompanionByName(app.dataDir, petName);
	}
});
