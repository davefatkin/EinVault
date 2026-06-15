import { test as base, expect } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { test } from '../lib/fixtures';
import { createSeededDbNoShift, SEED } from '../lib/seed';
import { startAppServer, type AppServer } from '../lib/app-server';
import { getFreePort } from '../lib/ports';

const REPO_ROOT = path.resolve(import.meta.dirname, '../..');
const EIN = SEED.companions.ein.id;

// ---------------------------------------------------------------------------
// A. Owner household tabs + account sheet — mobile-only
// ---------------------------------------------------------------------------

test('bottom tab bar shows Overview, Search, You but not Users @mobile', async ({
	asMember
}, testInfo) => {
	test.skip(testInfo.project.name !== 'mobile', 'mobile only');
	await asMember.goto('/');
	const nav = asMember.getByRole('navigation', { name: 'Main navigation' });
	await expect(nav.getByRole('link', { name: 'Overview' })).toBeVisible({ timeout: 8_000 });
	await expect(nav.getByRole('button', { name: 'Search' })).toBeVisible({ timeout: 8_000 });
	await expect(nav.getByRole('button', { name: 'You' })).toBeVisible({ timeout: 8_000 });
	await expect(nav.getByRole('link', { name: 'Users' })).toHaveCount(0);
});

test('mobile overview header is a companion dropdown that can jump into a companion @mobile', async ({
	asMember
}, testInfo) => {
	test.skip(testInfo.project.name !== 'mobile', 'mobile only');
	await asMember.goto('/');
	const trigger = asMember.getByRole('button', { name: 'Switch companion' });
	await expect(trigger).toBeVisible({ timeout: 8_000 });
	await expect(trigger).toContainText('Overview');
	await trigger.click();
	const listbox = asMember.getByRole('listbox', { name: 'Switch companion' });
	await listbox.getByRole('button', { name: 'Ein' }).first().click();
	await expect(asMember).toHaveURL(new RegExp(`/${EIN}$`));
});

test('member You tab opens account sheet with Settings + Sign Out only @mobile', async ({
	asMember
}, testInfo) => {
	test.skip(testInfo.project.name !== 'mobile', 'mobile only');
	await asMember.goto('/');
	const nav = asMember.getByRole('navigation', { name: 'Main navigation' });
	await nav.getByRole('button', { name: 'You' }).click();

	const sheet = asMember.getByRole('dialog', { name: 'Account menu' });
	await expect(sheet).toBeVisible({ timeout: 8_000 });
	await expect(sheet.getByRole('link', { name: 'Settings' })).toBeVisible();
	await expect(sheet.getByRole('button', { name: 'Sign Out' })).toBeVisible();
	// Admin-only entries must not appear for a member
	await expect(sheet.getByRole('link', { name: 'Users' })).toHaveCount(0);
	await expect(sheet.getByRole('link', { name: 'Companions' })).toHaveCount(0);
});

test('admin You tab account sheet shows Users and Companions @mobile', async ({
	asAdmin
}, testInfo) => {
	test.skip(testInfo.project.name !== 'mobile', 'mobile only');
	await asAdmin.goto('/');
	const nav = asAdmin.getByRole('navigation', { name: 'Main navigation' });
	await nav.getByRole('button', { name: 'You' }).click();

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
	const nav = asAdmin.getByRole('navigation', { name: 'Main navigation' });
	await nav.getByRole('button', { name: 'You' }).click();
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
	const nav = asAdmin.getByRole('navigation', { name: 'Main navigation' });
	await nav.getByRole('button', { name: 'You' }).click();
	const sheet = asAdmin.getByRole('dialog', { name: 'Account menu' });
	await expect(sheet).toBeVisible({ timeout: 8_000 });
	await sheet.getByRole('link', { name: 'Companions' }).click();
	await expect(asAdmin).toHaveURL(/\/admin\/companions/, { timeout: 8_000 });
});

// ---------------------------------------------------------------------------
// B. Owner account popover — desktop sidebar
// ---------------------------------------------------------------------------

test('admin sidebar account popover shows Settings + Users + Companions + Sign Out', async ({
	asAdmin
}, testInfo) => {
	test.skip(testInfo.project.name !== 'desktop', 'desktop sidebar only');
	await asAdmin.goto('/');
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
		const appPort = await getFreePort();
		const dbPath = createSeededDbNoShift(dir);
		let server: AppServer;
		try {
			server = await startAppServer({
				dbPath,
				env: { PORT: String(appPort) }
			});
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
	'caretaker off-shift: Journal and Log are locked @mobile',
	async ({ world, browser }, testInfo) => {
		test.skip(testInfo.project.name !== 'mobile', 'mobile bottom nav is mobile-only');

		// Log in as caretaker against the off-shift server
		const ctx = await browser.newContext({ baseURL: world.server.baseURL });
		const page = await ctx.newPage();
		await page.goto('/auth/login');
		await page.getByLabel('Username').fill(SEED.caretaker.username);
		await page.getByLabel('Password').fill(SEED.password);
		await page.getByRole('button', { name: 'Sign in' }).click();
		await expect(page.getByLabel('Username')).toHaveCount(0, { timeout: 10_000 });

		await page.goto(`/care/${EIN}`);

		// Journal and Log tabs render as <span> (not <a>) with aria-label containing
		// "requires active shift" text
		const nav = page.getByRole('navigation', { name: 'Caretaker navigation' });
		const journalLocked = nav.locator('[aria-label*="requires active shift"]', {
			hasText: /Journal/i
		});
		const logLocked = nav.locator('[aria-label*="requires active shift"]', {
			hasText: /Log activity/i
		});
		await expect(journalLocked).toBeVisible({ timeout: 8_000 });
		await expect(logLocked).toBeVisible({ timeout: 8_000 });

		// No active-link version of Journal or Log (locked items are spans, not anchors)
		await expect(nav.getByRole('link', { name: 'Journal' })).toHaveCount(0);
		await expect(nav.getByRole('link', { name: 'Log activity' })).toHaveCount(0);

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
