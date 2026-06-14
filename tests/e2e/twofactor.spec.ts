import { test as base, expect, type Browser, type Page } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { TOTP, Secret } from 'otpauth';
import { createSeededDb, SEED } from '../lib/seed';
import { startAppServer, type AppServer } from '../lib/app-server';
import { getFreePort } from '../lib/ports';

const REPO_ROOT = path.resolve(import.meta.dirname, '../..');

const ENC_KEY = Buffer.from(new Uint8Array(32).fill(11)).toString('base64');

// ---------------------------------------------------------------------------
// Module-level shared server — boots once, torn down via afterAll
// ---------------------------------------------------------------------------

let sharedServer: AppServer | null = null;
let sharedDir: string | null = null;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Derive a TOTP code from a Base32 key.
 * @param offset – extra seconds to add to the current timestamp (use 30 to get the next period).
 */
function deriveCode(base32Key: string, offset = 0): string {
	const totp = new TOTP({ secret: Secret.fromBase32(base32Key), digits: 6, period: 30 });
	return totp.generate({ timestamp: Date.now() + offset * 1000 });
}

/** Log in via the standard password form; does NOT wait for redirect. */
async function fillLogin(page: Page, username: string, password: string): Promise<void> {
	await page.getByLabel('Username').fill(username);
	await page.getByLabel('Password').fill(password);
	await page.getByRole('button', { name: 'Sign in' }).click();
}

/** Open a fresh browser context pre-pointed at the test server. */
function newCtx(browser: Browser, baseURL: string) {
	return browser.newContext({ baseURL });
}

// ---------------------------------------------------------------------------
// Fixture that reuses the module-level shared server
// ---------------------------------------------------------------------------

interface TwoFactorWorld {
	server: AppServer;
}

const test = base.extend<TwoFactorWorld>({
	// eslint-disable-next-line no-empty-pattern
	server: async ({}, use) => {
		if (!sharedServer) {
			throw new Error('Shared server not started — did beforeAll run?');
		}
		await use(sharedServer);
	}
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test.describe('2FA @desktop', () => {
	test.describe.configure({ mode: 'serial' });

	// Persistent state across serial tests within this file
	let enrolledKey = '';
	let firstBackupCode = '';

	test.beforeAll(async () => {
		const dir = path.join(REPO_ROOT, '.test-data', `2fa-shared-${Date.now()}`);
		sharedDir = dir;
		const appPort = await getFreePort();
		const dbPath = createSeededDb(dir);
		sharedServer = await startAppServer({
			dbPath,
			env: {
				PORT: String(appPort),
				TWOFA_ENC_KEY: ENC_KEY,
				OIDC_STATE_SECRET: 'test-2fa-secret'
			}
		});
	});

	test.afterAll(async () => {
		if (sharedServer) {
			await sharedServer.stop();
			sharedServer = null;
		}
		if (sharedDir) {
			fs.rmSync(sharedDir, { recursive: true, force: true });
			sharedDir = null;
		}
	});

	// -------------------------------------------------------------------------
	// 1. Enroll
	// -------------------------------------------------------------------------
	test('1. enroll member via settings', async ({ server, browser }) => {
		const ctx = await newCtx(browser, server.baseURL);
		const page = await ctx.newPage();

		// Log in
		await page.goto('/auth/login');
		await fillLogin(page, SEED.member.username, SEED.password);
		await expect(page).not.toHaveURL(/\/auth\//, { timeout: 10_000 });

		// Navigate to settings
		await page.goto('/settings');
		await expect(page).toHaveURL(/settings/, { timeout: 10_000 });

		// Click "Enable two-factor authentication"
		await page.getByRole('button', { name: /enable two-factor authentication/i }).click();

		// QR image + manual key must appear
		await expect(page.locator('img[alt=""]').first()).toBeVisible({ timeout: 10_000 });
		const keyEl = page.locator('code').first();
		await expect(keyEl).toBeVisible();
		const key = (await keyEl.textContent())!.trim();
		expect(key.length).toBeGreaterThan(10);
		enrolledKey = key;

		// Fill the confirm-code input and submit (scroll into view first)
		const code = deriveCode(key);
		const confirmInput = page.getByLabel(/enter the 6-digit code to confirm/i);
		await confirmInput.scrollIntoViewIfNeeded();
		await confirmInput.fill(code);
		await page.getByRole('button', { name: /^Confirm$/i }).click();

		// Backup codes should appear (10 codes matching xxxxx-xxxxx)
		const codePattern = /[a-z0-9]{5}-[a-z0-9]{5}/;
		const codeEls = page.locator('text=/[a-z0-9]{5}-[a-z0-9]{5}/');
		await expect(codeEls.first()).toBeVisible({ timeout: 10_000 });
		const count = await codeEls.count();
		expect(count).toBeGreaterThanOrEqual(10);

		// Save first backup code
		firstBackupCode = (await codeEls.first().textContent())!.trim();
		expect(firstBackupCode).toMatch(codePattern);

		await ctx.close();
	});

	// -------------------------------------------------------------------------
	// 2. Challenge with TOTP code
	// -------------------------------------------------------------------------
	test('2. login challenged with TOTP; code passes', async ({ server, browser }) => {
		const ctx = await newCtx(browser, server.baseURL);
		const page = await ctx.newPage();

		await page.goto('/auth/login');
		await fillLogin(page, SEED.member.username, SEED.password);

		// Must land on /auth/2fa
		await expect(page).toHaveURL(/\/auth\/2fa/, { timeout: 10_000 });

		// Submit a fresh TOTP code — use the next period (+30s) to avoid replay rejection
		// since the confirm step in test 1 consumed the current period's code.
		const code = deriveCode(enrolledKey, 30);
		await page.getByRole('textbox').fill(code);
		await page.getByRole('button', { name: /verify/i }).click();

		// Must leave /auth/2fa and land on /
		await expect(page).not.toHaveURL(/\/auth\/2fa/, { timeout: 10_000 });
		await expect(page).not.toHaveURL(/\/auth\/login/, { timeout: 10_000 });

		await ctx.close();
	});

	// -------------------------------------------------------------------------
	// 3. Backup code – single-use
	// -------------------------------------------------------------------------
	test('3a. backup code works once', async ({ server, browser }) => {
		const ctx = await newCtx(browser, server.baseURL);
		const page = await ctx.newPage();

		await page.goto('/auth/login');
		await fillLogin(page, SEED.member.username, SEED.password);
		await expect(page).toHaveURL(/\/auth\/2fa/, { timeout: 10_000 });

		await page.getByRole('textbox').fill(firstBackupCode);
		await page.getByRole('button', { name: /verify/i }).click();

		// Should succeed and land off /auth/2fa
		await expect(page).not.toHaveURL(/\/auth\/2fa/, { timeout: 10_000 });
		await expect(page).not.toHaveURL(/\/auth\/login/, { timeout: 10_000 });

		await ctx.close();
	});

	test('3b. same backup code rejected on second use', async ({ server, browser }) => {
		const ctx = await newCtx(browser, server.baseURL);
		const page = await ctx.newPage();

		await page.goto('/auth/login');
		await fillLogin(page, SEED.member.username, SEED.password);
		await expect(page).toHaveURL(/\/auth\/2fa/, { timeout: 10_000 });

		// Re-submit the already-used backup code
		await page.getByRole('textbox').fill(firstBackupCode);
		await page.getByRole('button', { name: /verify/i }).click();

		// Must stay on /auth/2fa with an error
		await expect(page).toHaveURL(/\/auth\/2fa/, { timeout: 10_000 });
		await expect(page.locator('[role="alert"]')).toBeVisible({ timeout: 5_000 });

		await ctx.close();
	});

	// -------------------------------------------------------------------------
	// 4. Wrong code
	// -------------------------------------------------------------------------
	test('4. wrong code is rejected', async ({ server, browser }) => {
		const ctx = await newCtx(browser, server.baseURL);
		const page = await ctx.newPage();

		await page.goto('/auth/login');
		await fillLogin(page, SEED.member.username, SEED.password);
		await expect(page).toHaveURL(/\/auth\/2fa/, { timeout: 10_000 });

		await page.getByRole('textbox').fill('000000');
		await page.getByRole('button', { name: /verify/i }).click();

		// Must stay on /auth/2fa with error visible
		await expect(page).toHaveURL(/\/auth\/2fa/, { timeout: 10_000 });
		await expect(page.locator('[role="alert"]')).toBeVisible({ timeout: 5_000 });

		await ctx.close();
	});

	// -------------------------------------------------------------------------
	// 5. Enforcement: admin enables "everyone", caretaker forced to enroll
	// -------------------------------------------------------------------------
	test('5. enforcement: caretaker forced to /2fa-setup when everyone required', async ({
		server,
		browser
	}) => {
		// Step A: log in as admin (spike, not yet enrolled) and set require2fa = everyone.
		// Note: admin spike has no 2FA — after setting "everyone" the admin themselves
		// would be bounced to /2fa-setup on next navigation. We switch to the caretaker
		// context immediately after the toggle and never revisit the admin session.
		const adminCtx = await newCtx(browser, server.baseURL);
		const adminPage = await adminCtx.newPage();

		await adminPage.goto('/auth/login');
		await fillLogin(adminPage, SEED.admin.username, SEED.password);
		await expect(adminPage).not.toHaveURL(/\/auth\//, { timeout: 10_000 });

		await adminPage.goto('/admin/users');
		await expect(adminPage).toHaveURL(/admin\/users/, { timeout: 10_000 });

		// Change the require-2fa select to "Everyone".
		// The select has onchange → requestSubmit, which POSTs and reloads.
		// After reload the admin themselves (no 2FA) will be redirected to /2fa-setup
		// by the enforcement gate. That's expected — we just need the DB write to have
		// happened, so wait for any navigation away from /admin/users.
		const select = adminPage.locator('select#require2fa');
		await select.selectOption('everyone');
		// Either we see a success alert (briefly) or we get redirected — either way
		// wait for a page-level change.
		await adminPage.waitForURL(/\/admin\/users|\/2fa-setup/, { timeout: 10_000 });

		await adminCtx.close();

		// Step B: caretaker (faye) logs in — has no 2FA — must be gated at /2fa-setup
		const careCtx = await newCtx(browser, server.baseURL);
		const carePage = await careCtx.newPage();

		await carePage.goto('/auth/login');
		await fillLogin(carePage, SEED.caretaker.username, SEED.password);
		// Caretaker lands on /care after login normally, but enforcement should redirect to /2fa-setup
		await expect(carePage).toHaveURL(/\/2fa-setup/, { timeout: 15_000 });

		// Page should show setup-required heading
		await expect(
			carePage.getByRole('heading', { name: /two-factor authentication required/i })
		).toBeVisible({ timeout: 5_000 });

		// Click "Enable two-factor authentication" / begin button
		await carePage.getByRole('button', { name: /enable two-factor authentication/i }).click();

		// QR + manual key must appear
		await expect(carePage.locator('img').first()).toBeVisible({ timeout: 10_000 });
		const keyEl = carePage.locator('code').first();
		await expect(keyEl).toBeVisible();
		const careKey = (await keyEl.textContent())!.trim();
		expect(careKey.length).toBeGreaterThan(10);

		// Confirm with a valid code
		const confirmInput = carePage.getByLabel(/enter the 6-digit code to confirm/i);
		await confirmInput.scrollIntoViewIfNeeded();
		await confirmInput.fill(deriveCode(careKey));
		await carePage.getByRole('button', { name: /^Confirm$/i }).click();

		// After successful enrollment at /2fa-setup the server redirects to /
		// Caretakers redirect to /care
		await expect(carePage).not.toHaveURL(/\/2fa-setup/, { timeout: 15_000 });
		await expect(carePage).not.toHaveURL(/\/auth\//, { timeout: 10_000 });

		await careCtx.close();
	});

	// -------------------------------------------------------------------------
	// 6. Admin reset of member 2FA
	// -------------------------------------------------------------------------
	test('6. admin can reset member 2FA', async ({ server, browser }) => {
		// Admin (spike) must first enroll themselves because "everyone" enforcement is on
		// (set in test 5). Spike logs in → gets bounced to /2fa-setup.
		const adminCtx = await newCtx(browser, server.baseURL);
		const adminPage = await adminCtx.newPage();

		await adminPage.goto('/auth/login');
		await fillLogin(adminPage, SEED.admin.username, SEED.password);
		// With enforcement on, admin should be gated at /2fa-setup
		await expect(adminPage).toHaveURL(/\/2fa-setup/, { timeout: 15_000 });

		await adminPage.getByRole('button', { name: /enable two-factor authentication/i }).click();
		await expect(adminPage.locator('img').first()).toBeVisible({ timeout: 10_000 });
		const adminKeyEl = adminPage.locator('code').first();
		const adminKey = (await adminKeyEl.textContent())!.trim();
		const adminConfirm = adminPage.getByLabel(/enter the 6-digit code to confirm/i);
		await adminConfirm.scrollIntoViewIfNeeded();
		await adminConfirm.fill(deriveCode(adminKey));
		await adminPage.getByRole('button', { name: /^Confirm$/i }).click();
		await expect(adminPage).not.toHaveURL(/\/2fa-setup/, { timeout: 10_000 });

		// Now navigate to /admin/users and open the member (Jet) drawer.
		// Admin will be challenged at /auth/2fa since they just enrolled.
		// But wait — the /2fa-setup flow redirects directly to / creating a full session,
		// so there's no pending MFA cookie — they're already logged in.
		await adminPage.goto('/admin/users');
		await expect(adminPage).toHaveURL(/admin\/users/, { timeout: 10_000 });

		// Find and click the Manage button for Jet
		const jetManageBtn = adminPage
			.locator('div')
			.filter({ hasText: /\bJet\b/ })
			.getByRole('button', { name: /manage/i })
			.first();
		await jetManageBtn.click();

		// Reset two-factor button should be visible (member has 2FA enabled)
		await expect(adminPage.getByRole('button', { name: /reset two-factor/i })).toBeVisible({
			timeout: 10_000
		});
		await adminPage.getByRole('button', { name: /reset two-factor/i }).click();

		// Success feedback in the drawer
		await expect(
			adminPage.locator('[role="alert"]').filter({ hasText: /two-factor reset/i })
		).toBeVisible({ timeout: 10_000 });

		await adminCtx.close();

		// Member (jet) should now be sent to /2fa-setup (enforcement is still "everyone")
		// since their 2FA was cleared by the admin reset.
		const memberCtx = await newCtx(browser, server.baseURL);
		const memberPage = await memberCtx.newPage();

		await memberPage.goto('/auth/login');
		await fillLogin(memberPage, SEED.member.username, SEED.password);

		// With enforcement on and 2FA cleared, member should be redirected to /2fa-setup
		await expect(memberPage).toHaveURL(/\/2fa-setup/, { timeout: 15_000 });

		await memberCtx.close();
	});
});
