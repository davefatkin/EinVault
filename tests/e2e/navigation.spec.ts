import { test as base, expect } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { test } from '../lib/fixtures';
import { createSeededDbNoShift, SEED } from '../lib/seed';
import { startAppServer, type AppServer } from '../lib/app-server';
import { waitForHydration } from '../lib/hydration';
import { insertMedication, deleteMedications } from '../lib/medications';
import { archiveCompanion, createCompanionViaUi, deleteCompanionByName } from '../lib/companions';
import { moreButton } from '../lib/more';

const REPO_ROOT = path.resolve(import.meta.dirname, '../..');
const EIN = SEED.companions.ein.id;

// ---------------------------------------------------------------------------
// A. Owner top bar + account sheet — mobile-only
// ---------------------------------------------------------------------------

test('household and settings pages have no bottom bar @mobile', async ({ asMember }, testInfo) => {
	test.skip(testInfo.project.name !== 'mobile', 'mobile only');
	for (const url of ['/', '/settings']) {
		await asMember.goto(url);
		await expect(asMember.getByRole('button', { name: 'Open search' })).toBeVisible({
			timeout: 8_000
		});
		await expect(asMember.getByRole('button', { name: 'Open account menu' })).toBeVisible();
		await expect(asMember.getByRole('navigation', { name: 'Main navigation' })).toHaveCount(0);
	}
});

test('mobile overview header is a companion dropdown that can jump into a companion @mobile', async ({
	asMember
}, testInfo) => {
	test.skip(testInfo.project.name !== 'mobile', 'mobile only');
	await asMember.goto('/');
	await waitForHydration(asMember);
	const trigger = asMember.getByRole('button', { name: 'Switch companion' });
	await expect(trigger).toBeVisible({ timeout: 8_000 });
	await expect(trigger).toContainText('Overview');
	await trigger.click();
	const group = asMember.getByRole('group', { name: 'Switch companion' });
	await group.getByRole('link', { name: 'Ein' }).first().click();
	await expect(asMember).toHaveURL(new RegExp(`/${EIN}$`));
});

test('member household account button opens account sheet with Settings + Sign Out only @mobile', async ({
	asMember
}, testInfo) => {
	test.skip(testInfo.project.name !== 'mobile', 'mobile only');
	await asMember.goto('/');
	await waitForHydration(asMember);
	await asMember.getByRole('button', { name: 'Open account menu' }).click();

	const sheet = asMember.getByRole('dialog', { name: 'Account menu' });
	await expect(sheet).toBeVisible({ timeout: 8_000 });
	await expect(sheet.getByRole('link', { name: 'Settings' })).toBeVisible();
	await expect(sheet.getByRole('button', { name: 'Sign Out' })).toBeVisible();
	// Admin-only entries must not appear for a member
	await expect(sheet.getByRole('link', { name: 'Users' })).toHaveCount(0);
	await expect(sheet.getByRole('link', { name: 'Companions' })).toHaveCount(0);
});

test('companion page top bar avatar opens account sheet @mobile', async ({
	asMember
}, testInfo) => {
	test.skip(testInfo.project.name !== 'mobile', 'mobile only');
	await asMember.goto(`/${EIN}`);
	await waitForHydration(asMember);
	const avatarButton = asMember.getByRole('button', { name: 'Open account menu' });
	await expect(avatarButton).toBeVisible({ timeout: 8_000 });
	await avatarButton.click();

	const sheet = asMember.getByRole('dialog', { name: 'Account menu' });
	await expect(sheet).toBeVisible({ timeout: 8_000 });
	await expect(sheet.getByRole('link', { name: 'Settings' })).toBeVisible();
	await expect(sheet.getByRole('button', { name: 'Sign Out' })).toBeVisible();
});

test('companion page account sheet Settings link navigates to /settings @mobile', async ({
	asMember
}, testInfo) => {
	test.skip(testInfo.project.name !== 'mobile', 'mobile only');
	await asMember.goto(`/${EIN}`);
	await waitForHydration(asMember);
	await asMember.getByRole('button', { name: 'Open account menu' }).click();
	const sheet = asMember.getByRole('dialog', { name: 'Account menu' });
	await expect(sheet).toBeVisible({ timeout: 8_000 });
	await sheet.getByRole('link', { name: 'Settings' }).click();
	await expect(asMember).toHaveURL(/\/settings/, { timeout: 8_000 });
});

test('admin companion page account sheet shows Users and Companions @mobile', async ({
	asAdmin
}, testInfo) => {
	test.skip(testInfo.project.name !== 'mobile', 'mobile only');
	await asAdmin.goto(`/${EIN}`);
	await waitForHydration(asAdmin);
	await asAdmin.getByRole('button', { name: 'Open account menu' }).click();
	const sheet = asAdmin.getByRole('dialog', { name: 'Account menu' });
	await expect(sheet).toBeVisible({ timeout: 8_000 });
	await expect(sheet.getByRole('link', { name: 'Users' })).toBeVisible();
	await expect(sheet.getByRole('link', { name: 'Companions' })).toBeVisible();
});

test('admin household account sheet shows Users and Companions @mobile', async ({
	asAdmin
}, testInfo) => {
	test.skip(testInfo.project.name !== 'mobile', 'mobile only');
	await asAdmin.goto('/');
	await waitForHydration(asAdmin);
	await asAdmin.getByRole('button', { name: 'Open account menu' }).click();

	const sheet = asAdmin.getByRole('dialog', { name: 'Account menu' });
	await expect(sheet).toBeVisible({ timeout: 8_000 });
	await expect(sheet.getByRole('link', { name: 'Users' })).toBeVisible();
	await expect(sheet.getByRole('link', { name: 'Companions' })).toBeVisible();
});

test('admin account sheet Users link navigates to /admin/users @mobile', async ({
	asAdmin
}, testInfo) => {
	test.skip(testInfo.project.name !== 'mobile', 'mobile only');
	await asAdmin.goto('/');
	await waitForHydration(asAdmin);
	await asAdmin.getByRole('button', { name: 'Open account menu' }).click();
	const sheet = asAdmin.getByRole('dialog', { name: 'Account menu' });
	await expect(sheet).toBeVisible({ timeout: 8_000 });
	await sheet.getByRole('link', { name: 'Users' }).click();
	await expect(asAdmin).toHaveURL(/\/admin\/users/, { timeout: 8_000 });
});

test('admin account sheet Companions link navigates to /admin/companions @mobile', async ({
	asAdmin
}, testInfo) => {
	test.skip(testInfo.project.name !== 'mobile', 'mobile only');
	await asAdmin.goto('/');
	await waitForHydration(asAdmin);
	await asAdmin.getByRole('button', { name: 'Open account menu' }).click();
	const sheet = asAdmin.getByRole('dialog', { name: 'Account menu' });
	await expect(sheet).toBeVisible({ timeout: 8_000 });
	await sheet.getByRole('link', { name: 'Companions' }).click();
	await expect(asAdmin).toHaveURL(/\/admin\/companions/, { timeout: 8_000 });
});

// ---------------------------------------------------------------------------
// A2. Pet view bottom bar and More sheet — mobile-only
// ---------------------------------------------------------------------------

test.describe('More sheet', () => {
	// eslint-disable-next-line no-empty-pattern
	test.beforeEach(({}, testInfo) => {
		test.skip(testInfo.project.name !== 'mobile', 'mobile only');
	});

	test('More opens grouped sections and marks the current one @mobile', async ({ asMember }) => {
		await asMember.goto(`/${EIN}/medications`);
		const more = await moreButton(asMember);
		await expect(more).toHaveAccessibleName(/current section/);
		await expect(more).toHaveAttribute('aria-expanded', 'false');
		await more.click();
		await expect(more).toHaveAttribute('aria-expanded', 'true');

		const dialog = asMember.getByRole('dialog', { name: 'More sections' });
		await expect(dialog).toBeVisible();
		await expect(dialog.getByRole('heading')).toHaveText(['Health', 'Records']);
		const rows = dialog.getByRole('link');
		await expect(rows).toHaveText([/^\s*Health/, 'Medications', 'Supplies', 'Documents', 'Notes']);
		await expect(dialog.getByText('Vet visits, weight, incidents')).toBeVisible();
		await expect(rows.filter({ hasText: 'Medications' })).toHaveAttribute('aria-current', 'page');
		await expect(rows.filter({ hasText: 'Supplies' })).not.toHaveAttribute('aria-current');
	});

	test('tapping the current section closes More @mobile', async ({ asMember }) => {
		await asMember.goto(`/${EIN}/medications`);
		const more = await moreButton(asMember);
		await more.click();
		const dialog = asMember.getByRole('dialog', { name: 'More sections' });
		await dialog.getByRole('link', { name: 'Medications' }).click();
		await expect(dialog).toBeHidden();
		await expect(asMember).toHaveURL(new RegExp(`/${EIN}/medications$`));
	});

	test('Escape closes More and returns focus to it @mobile', async ({ asMember }) => {
		await asMember.goto(`/${EIN}`);
		const more = await moreButton(asMember);
		await expect(more).not.toHaveAccessibleName(/current section/);
		await more.click();
		const dialog = asMember.getByRole('dialog', { name: 'More sections' });
		await expect(dialog.getByRole('link').first()).toBeFocused();
		await asMember.keyboard.press('Escape');
		await expect(dialog).toBeHidden();
		await expect(more).toBeFocused();
	});

	test('a tap outside the sheet closes More, even on the inert bar @mobile', async ({
		asMember
	}) => {
		await asMember.goto(`/${EIN}`);
		const more = await moreButton(asMember);
		const box = (await more.boundingBox())!;
		await more.click();
		const dialog = asMember.getByRole('dialog', { name: 'More sections' });
		await expect(dialog).toBeVisible();
		// The bar is inert while the sheet is open, so the tap lands on the scrim.
		await asMember.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
		await expect(dialog).toBeHidden();
		await expect(asMember).toHaveURL(new RegExp(`/${EIN}$`));
		await expect(more).toBeFocused();
	});

	test('tab labels fit at 360px @mobile', async ({ asMember }) => {
		await asMember.setViewportSize({ width: 360, height: 740 });
		const navLabels = { es: 'Navegación principal', de: 'Hauptnavigation' } as const;
		try {
			for (const locale of ['es', 'de'] as const) {
				await setLocale(asMember, locale);
				// Reminders, not the dashboard: the dashboard's quick-log tiles are
				// wider than 360px in es/de, and an overflowing page widens the
				// layout viewport, which would widen the tabs too.
				await asMember.goto(`/${EIN}/reminders`);
				await waitForHydration(asMember);
				expect(await asMember.evaluate(() => window.innerWidth)).toBe(360);
				const nav = asMember.getByRole('navigation', { name: navLabels[locale] });
				const labels = nav.locator('[data-tab-label]');
				await expect(labels).toHaveCount(4);
				for (const label of await labels.all()) {
					const { scrollWidth, clientWidth, text } = await label.evaluate((el) => ({
						scrollWidth: el.scrollWidth,
						clientWidth: el.clientWidth,
						text: el.textContent
					}));
					expect(scrollWidth, `${locale} "${text}" overflows its tab`).toBeLessThanOrEqual(
						clientWidth
					);
				}
			}
		} finally {
			await setLocale(asMember, 'en');
		}
	});
});

async function setLocale(page: import('@playwright/test').Page, locale: string) {
	await page.goto('/settings');
	await waitForHydration(page);
	await page.locator('select[name="locale"]').selectOption(locale);
	await page.waitForLoadState('networkidle');
	// Wait for the save to land: the member's locale is shared by every later
	// spec in this worker.
	await expect(page.locator('html')).toHaveAttribute('lang', locale);
}

// ---------------------------------------------------------------------------
// B. Owner account popover — desktop sidebar
// ---------------------------------------------------------------------------

test('admin sidebar account popover shows Settings + Users + Companions + Sign Out', async ({
	asAdmin
}, testInfo) => {
	test.skip(testInfo.project.name !== 'desktop', 'desktop sidebar only');
	await asAdmin.goto('/');
	await waitForHydration(asAdmin);
	// The account trigger is the button with aria-haspopup="dialog" in the sidebar
	const trigger = asAdmin.getByRole('button', { name: new RegExp(SEED.admin.displayName, 'i') });
	await expect(trigger).toBeVisible({ timeout: 8_000 });
	await trigger.click();

	const popover = asAdmin.getByRole('dialog', { name: 'Account menu' });
	await expect(popover).toBeVisible({ timeout: 8_000 });
	await expect(popover.getByRole('link', { name: 'Settings' })).toBeVisible();
	await expect(popover.getByRole('link', { name: 'Users' })).toBeVisible();
	await expect(popover.getByRole('link', { name: 'Companions' })).toBeVisible();
	await expect(popover.getByRole('button', { name: 'Sign Out' })).toBeVisible();
});

test('member sidebar account popover shows Settings + Sign Out but not Users/Companions', async ({
	asMember
}, testInfo) => {
	test.skip(testInfo.project.name !== 'desktop', 'desktop sidebar only');
	await asMember.goto('/');
	const trigger = asMember.getByRole('button', {
		name: new RegExp(SEED.member.displayName, 'i')
	});
	await expect(trigger).toBeVisible({ timeout: 8_000 });
	await trigger.click();

	const popover = asMember.getByRole('dialog', { name: 'Account menu' });
	await expect(popover).toBeVisible({ timeout: 8_000 });
	await expect(popover.getByRole('link', { name: 'Settings' })).toBeVisible();
	await expect(popover.getByRole('button', { name: 'Sign Out' })).toBeVisible();
	await expect(popover.getByRole('link', { name: 'Users' })).toHaveCount(0);
	await expect(popover.getByRole('link', { name: 'Companions' })).toHaveCount(0);
});

// ---------------------------------------------------------------------------
// C. Caretaker nav — on shift (seed default)
// ---------------------------------------------------------------------------

test('caretaker on-shift: Journal and Log tabs are links (not locked) @mobile', async ({
	asCaretaker
}, testInfo) => {
	test.skip(testInfo.project.name !== 'mobile', 'mobile bottom nav is mobile-only');
	await asCaretaker.goto(`/care/${EIN}`);
	const nav = asCaretaker.getByRole('navigation', { name: 'Caretaker navigation' });
	await expect(nav.getByRole('link', { name: 'Journal' })).toBeVisible({ timeout: 8_000 });
	await expect(nav.getByRole('link', { name: 'Log activity' })).toBeVisible({ timeout: 8_000 });
});

test('caretaker on-shift: Quick add FAB is present and opens Log activity + Add journal entry @mobile', async ({
	asCaretaker
}, testInfo) => {
	test.skip(testInfo.project.name !== 'mobile', 'mobile only');
	await asCaretaker.goto(`/care/${EIN}`);
	await waitForHydration(asCaretaker);
	// exact: true avoids matching the "Close quick add menu" backdrop button
	const fab = asCaretaker.getByRole('button', { name: 'Quick add', exact: true });
	await expect(fab).toBeVisible({ timeout: 8_000 });
	await fab.click();
	await expect(fab).toHaveAttribute('aria-expanded', 'true', { timeout: 8_000 });
	// The caretaker nav holds the FAB popup links alongside the nav tab links.
	// Both are in the same nav landmark, so scope to the nav and expect at least
	// one visible instance of each action link (the popup item).
	const nav = asCaretaker.getByRole('navigation', { name: 'Caretaker navigation' });
	await expect(nav.getByRole('link', { name: 'Log activity' }).first()).toBeVisible({
		timeout: 8_000
	});
	await expect(nav.getByRole('link', { name: 'Add journal entry' }).first()).toBeVisible({
		timeout: 8_000
	});
});

test('caretaker on-shift desktop: Journal and Log are links (not locked)', async ({
	asCaretaker
}, testInfo) => {
	test.skip(testInfo.project.name !== 'desktop', 'desktop only');
	await asCaretaker.goto(`/care/${EIN}`);
	const nav = asCaretaker.getByRole('navigation', { name: 'Caretaker navigation' });
	await expect(nav.getByRole('link', { name: 'Journal' })).toBeVisible({ timeout: 8_000 });
	await expect(nav.getByRole('link', { name: 'Log activity' })).toBeVisible({ timeout: 8_000 });
});

test('caretaker has no Open search control on care page', async ({ asCaretaker }) => {
	await asCaretaker.goto(`/care/${EIN}`);
	await expect(asCaretaker.getByRole('button', { name: 'Open search' })).toHaveCount(0, {
		timeout: 8_000
	});
});

// ---------------------------------------------------------------------------
// D. Caretaker nav — off shift (dedicated per-test server, no active shift)
// ---------------------------------------------------------------------------

interface OffShiftWorld {
	server: AppServer;
}

const offShiftTest = base.extend<{ world: OffShiftWorld }>({
	// eslint-disable-next-line no-empty-pattern
	world: async ({}, use, testInfo) => {
		const dir = path.join(
			REPO_ROOT,
			'.test-data',
			`nav-offshift-${testInfo.workerIndex}-${testInfo.testId}`
		);
		const dbPath = createSeededDbNoShift(dir);
		let server: AppServer;
		try {
			server = await startAppServer({ dbPath });
		} catch (err) {
			fs.rmSync(dir, { recursive: true, force: true });
			throw err;
		}
		await use({ server });
		await server.stop();
		fs.rmSync(dir, { recursive: true, force: true });
	}
});

offShiftTest(
	'caretaker off shift: locked tabs keep their label and say they need a shift @mobile',
	async ({ world, browser }, testInfo) => {
		test.skip(testInfo.project.name !== 'mobile', 'mobile bottom nav is mobile-only');

		const ctx = await browser.newContext({ baseURL: world.server.baseURL });
		const page = await ctx.newPage();
		await page.goto('/auth/login');
		await page.getByLabel('Username').fill(SEED.caretaker.username);
		await page.getByLabel('Password').fill(SEED.password);
		await page.getByRole('button', { name: 'Sign in' }).click();
		await expect(page.getByLabel('Username')).toHaveCount(0, { timeout: 10_000 });

		await page.goto(`/care/${EIN}`);

		// Locked tabs are non-interactive, show their label, and carry a visually
		// hidden note that they need an active shift.
		const nav = page.getByRole('navigation', { name: 'Caretaker navigation' });
		const journalLocked = nav.locator('span', { hasText: 'Journal' }).filter({
			hasText: 'requires active shift'
		});
		const logLocked = nav.locator('span', { hasText: 'Log activity' }).filter({
			hasText: 'requires active shift'
		});
		await expect(journalLocked.first()).toBeVisible({ timeout: 8_000 });
		await expect(logLocked.first()).toBeVisible({ timeout: 8_000 });
		await expect(nav.getByText('Journal', { exact: true })).toBeVisible();
		await expect(nav.getByText('Log activity', { exact: true })).toBeVisible();

		// No link version of Journal or Log, and no Quick add on the bar
		await expect(nav.getByRole('link', { name: /Journal/ })).toHaveCount(0);
		await expect(nav.getByRole('link', { name: /Log activity/ })).toHaveCount(0);
		await expect(nav.getByRole('button', { name: 'Quick add' })).toHaveCount(0);

		await ctx.close();
	}
);

offShiftTest(
	'caretaker off-shift: no Quick add FAB @mobile',
	async ({ world, browser }, testInfo) => {
		test.skip(testInfo.project.name !== 'mobile', 'mobile only');

		const ctx = await browser.newContext({ baseURL: world.server.baseURL });
		const page = await ctx.newPage();
		await page.goto('/auth/login');
		await page.getByLabel('Username').fill(SEED.caretaker.username);
		await page.getByLabel('Password').fill(SEED.password);
		await page.getByRole('button', { name: 'Sign in' }).click();
		await expect(page.getByLabel('Username')).toHaveCount(0, { timeout: 10_000 });

		await page.goto(`/care/${EIN}`);
		await expect(page.getByRole('button', { name: 'Quick add' })).toHaveCount(0, {
			timeout: 8_000
		});

		await ctx.close();
	}
);

offShiftTest(
	'caretaker off-shift desktop: Journal and Log are locked spans in pill nav',
	async ({ world, browser }, testInfo) => {
		test.skip(testInfo.project.name !== 'desktop', 'desktop only');

		const ctx = await browser.newContext({ baseURL: world.server.baseURL });
		const page = await ctx.newPage();
		await page.goto('/auth/login');
		await page.getByLabel('Username').fill(SEED.caretaker.username);
		await page.getByLabel('Password').fill(SEED.password);
		await page.getByRole('button', { name: 'Sign in' }).click();
		await expect(page.getByLabel('Username')).toHaveCount(0, { timeout: 10_000 });

		await page.goto(`/care/${EIN}`);

		const nav = page.getByRole('navigation', { name: 'Caretaker navigation' });
		// Locked items are <span> elements with aria-label containing "requires active shift"
		await expect(nav.locator('[aria-label*="requires active shift"]').first()).toBeVisible({
			timeout: 8_000
		});
		// No active links for Journal or Log in the pill nav
		await expect(nav.getByRole('link', { name: 'Journal' })).toHaveCount(0);
		await expect(nav.getByRole('link', { name: 'Log activity' })).toHaveCount(0);

		await ctx.close();
	}
);

// ---------------------------------------------------------------------------
// One pet switcher: links keep the section, archived pets show, care status
// ---------------------------------------------------------------------------

const EDWARD = SEED.companions.edward.id;

async function openSwitcher(page: import('@playwright/test').Page) {
	await waitForHydration(page);
	const group = page.getByRole('group', { name: 'Switch companion' });
	await expect(async () => {
		if (!(await group.isVisible()))
			await page
				.getByRole('button', { name: 'Switch companion' })
				.filter({ visible: true })
				.click();
		await expect(group).toBeVisible({ timeout: 1_000 });
	}).toPass();
	return group;
}

test.describe('pet switcher', () => {
	test('switching pets on a medication page lands on the other pet medications', async ({
		asMember,
		app
	}) => {
		const medId = insertMedication(app.dataDir, { companionId: EIN, name: 'e2e-switch-med' });
		try {
			await asMember.goto(`/${EIN}/medications/${medId}`);
			const group = await openSwitcher(asMember);
			await group.getByRole('link', { name: 'Edward' }).click();
			await expect(asMember).toHaveURL(new RegExp(`/${EDWARD}/medications$`));
		} finally {
			deleteMedications(app.dataDir, [medId]);
		}
	});

	test('switching pets keeps the journal day', async ({ asMember }) => {
		await asMember.goto(`/${EIN}/journal/2026-05-12`);
		const group = await openSwitcher(asMember);
		await group.getByRole('link', { name: 'Edward' }).click();
		await expect(asMember).toHaveURL(new RegExp(`/${EDWARD}/journal/2026-05-12$`));
	});

	test('an archived pet shows in the switcher @mobile', async ({ asAdmin, app }, testInfo) => {
		const name = `e2e-archived-${testInfo.workerIndex}`;
		try {
			const id = await createCompanionViaUi(asAdmin, name);
			archiveCompanion(app.dataDir, id);
			await asAdmin.goto(`/${id}`);
			await waitForHydration(asAdmin);
			const trigger = asAdmin
				.getByRole('button', { name: 'Switch companion' })
				.filter({ visible: true });
			await expect(trigger).toContainText(name);
			await trigger.click();
			const group = asAdmin.getByRole('group', { name: 'Switch companion' });
			await expect(group.getByRole('link', { name })).toHaveCount(0);
			if (testInfo.project.name === 'mobile') {
				await expect(asAdmin.getByRole('navigation', { name: 'Main navigation' })).toBeVisible();
			}
		} finally {
			deleteCompanionByName(app.dataDir, name);
		}
	});

	test('sidebar groups sections under Health and Records', async ({ asMember, app }, testInfo) => {
		test.skip(testInfo.project.name !== 'desktop', 'the sidebar is desktop-only');
		const medId = insertMedication(app.dataDir, { companionId: EIN, name: 'e2e-sidebar-med' });
		try {
			await asMember.goto(`/${EIN}/medications/${medId}`);
			const sidebar = asMember.getByRole('complementary', { name: 'Main navigation' });
			const links = sidebar.getByRole('navigation').getByRole('link');
			await expect(links).toHaveText([
				'Dashboard',
				'Journal',
				'Reminders',
				'Health',
				'Medications',
				'Supplies',
				'Documents',
				'Notes'
			]);
			await expect(sidebar.getByText('Health', { exact: true }).first()).toBeVisible();
			await expect(sidebar.getByRole('group', { name: 'Health' })).toBeVisible();
			await expect(sidebar.getByRole('group', { name: 'Records' })).toBeVisible();
			await expect(sidebar.getByText('Records', { exact: true })).toBeVisible();
			await expect(links.filter({ hasText: 'Medications' })).toHaveAttribute(
				'aria-current',
				'page'
			);
		} finally {
			deleteMedications(app.dataDir, [medId]);
		}
	});

	test('sidebar switcher shows care status', async ({ asMember }, testInfo) => {
		test.skip(testInfo.project.name === 'mobile', 'the sidebar is desktop-only');
		await asMember.goto(`/${EIN}`);
		await waitForHydration(asMember);
		await expect(
			asMember.getByRole('button', { name: 'Switch companion' }).filter({ visible: true })
		).toHaveAccessibleName(/Care status/);
	});

	test('escape closes the switcher and returns focus to the trigger', async ({ asMember }) => {
		await asMember.goto(`/${EIN}`);
		const group = await openSwitcher(asMember);
		await group.getByRole('link').first().focus();
		await asMember.keyboard.press('Escape');
		await expect(group).toHaveCount(0);
		await expect(
			asMember.getByRole('button', { name: 'Switch companion' }).filter({ visible: true })
		).toBeFocused();
	});
});
