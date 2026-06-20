import { test as base, expect } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { startAppServer, type AppServer } from '../lib/app-server';
import { getFreePort } from '../lib/ports';
import { SEED } from '../lib/seed';
import { copyDemoPhotoFiles } from '../../src/lib/server/db/demo-seed';

const REPO_ROOT = path.resolve(import.meta.dirname, '../..');

interface DemoWorld {
	server: AppServer;
}

const test = base.extend<{ world: DemoWorld }>({
	// eslint-disable-next-line no-empty-pattern
	world: async ({}, use, testInfo) => {
		const dir = path.join(
			REPO_ROOT,
			'.test-data',
			`demo-${testInfo.workerIndex}-${testInfo.testId}`
		);
		// Boot with a fresh EMPTY dir — the app auto-seeds via ensureDemoUsers +
		// refreshDemoContent in hooks.server.ts. No createSeededDb here.
		fs.rmSync(dir, { recursive: true, force: true });
		fs.mkdirSync(dir, { recursive: true });
		const dbPath = path.join(dir, 'einvault.db');

		const appPort = await getFreePort();
		let server: AppServer;
		try {
			server = await startAppServer({
				dbPath,
				env: {
					PORT: String(appPort),
					DEMO_MODE: 'true'
				}
			});
		} catch (err) {
			fs.rmSync(dir, { recursive: true, force: true });
			throw err;
		}

		// CRITICAL: boot-time seeding is fire-and-forget.
		// startAppServer only confirms the HTTP port is up; ensureDemoUsers and
		// refreshDemoContent may still be running. Poll until the login page
		// renders the demo picker (confirms users exist) AND the companion name
		// appears on the home page (confirms companions were seeded).
		const baseURL = server.baseURL;

		// Phase 1: wait for the demo picker to appear (users seeded).
		const phase1Deadline = Date.now() + 25_000;
		let usersReady = false;
		while (Date.now() < phase1Deadline) {
			try {
				const res = await fetch(`${baseURL}/auth/login`);
				if (res.ok) {
					const html = await res.text();
					if (html.includes('Explore as Admin')) {
						usersReady = true;
						break;
					}
				}
			} catch {
				/* not up yet */
			}
			await new Promise((r) => setTimeout(r, 200));
		}

		if (!usersReady) {
			await server.stop();
			fs.rmSync(dir, { recursive: true, force: true });
			throw new Error(
				`Demo users never appeared in login page (25s)\n--- logs ---\n${server.logs.join('')}`
			);
		}

		// Phase 2: wait for companion content (refreshDemoContent runs after ensureDemoUsers).
		// Log in as admin and poll the home page until a companion's species appears
		// (the breed name won't appear until companions are actually seeded).
		// 'Pembroke Welsh Corgi' is unique enough to not appear before seeding.
		const companionBreed = SEED.companions.ein.breed;
		const phase2Deadline = Date.now() + 25_000;
		let contentReady = false;
		while (Date.now() < phase2Deadline) {
			try {
				const loginRes = await fetch(`${baseURL}/auth/demo`, {
					method: 'POST',
					body: new URLSearchParams({ role: 'admin' }),
					headers: { 'Content-Type': 'application/x-www-form-urlencoded', Origin: baseURL },
					redirect: 'manual'
				});
				// Node fetch's headers.get('set-cookie') joins multiple Set-Cookie
				// headers with ', '. Extract each name=value pair (before the first ';')
				// and rejoin as a Cookie header.
				const rawSetCookie = loginRes.headers.get('set-cookie') ?? '';
				// Split on ', ' but only at header boundaries (before each name=value pair)
				const cookieVal = rawSetCookie
					.split(/,\s*(?=[^;,]+=)/)
					.map((c) => c.split(';')[0].trim())
					.join('; ');
				if (cookieVal) {
					// Check the companion profile page, not the home page (home may not show breed)
					const profileRes = await fetch(`${baseURL}/${SEED.companions.ein.id}`, {
						headers: { Cookie: cookieVal }
					});
					if (profileRes.ok) {
						const html = await profileRes.text();
						if (html.includes(companionBreed)) {
							contentReady = true;
							break;
						}
					}
				}
			} catch {
				/* transient */
			}
			await new Promise((r) => setTimeout(r, 200));
		}

		if (!contentReady) {
			await server.stop();
			fs.rmSync(dir, { recursive: true, force: true });
			throw new Error(
				`Demo content ('${companionBreed}') never appeared (25s)\n--- logs ---\n${server.logs.join('')}`
			);
		}

		// The production build does not bundle the demo photo assets
		// (they live in src/lib/server/db/demo-assets/ which vite bundles via
		// import.meta.url at source level but the adapter-node build doesn't
		// copy the containing directory). Copy the source assets now so the
		// /api/photos/journal/* routes can serve them during the spec.
		// We use Date.now() which matches the server's seeding `now` within a
		// few seconds — day-granularity dates are identical unless crossing UTC midnight.
		copyDemoPhotoFiles(path.join(dir, 'uploads'), Date.now());

		await use({ server });
		await server.stop();
		fs.rmSync(dir, { recursive: true, force: true });
	}
});

// Fixture setup can take 30s (server start) + seeding. Override the 30s default.
test.setTimeout(90_000);

// ─── 1. Login shows picker, not credential form ───────────────────────────────

test('login page shows role picker not credential form', async ({ world, page }) => {
	await page.goto(world.server.baseURL + '/auth/login');

	await expect(page.getByRole('button', { name: /Explore as Admin/i })).toBeVisible({
		timeout: 10_000
	});
	await expect(page.getByRole('button', { name: /Explore as Member/i })).toBeVisible();
	await expect(page.getByRole('button', { name: /Explore as Caretaker/i })).toBeVisible();

	// Password input must not exist (exact match avoids "Confirm password" collision)
	await expect(page.getByLabel('Password', { exact: true })).toHaveCount(0);
});

// ─── 2. Each role lands correctly ─────────────────────────────────────────────

test('admin role lands on /', async ({ world, page }) => {
	await page.goto(world.server.baseURL + '/auth/login');
	await page.getByRole('button', { name: /Explore as Admin/i }).click();
	await expect(page).not.toHaveURL(/auth\/login/, { timeout: 10_000 });
	await expect(page).not.toHaveURL(/\/care/, { timeout: 10_000 });
	// Should be on / or a companion page (not in /care, not in /auth)
	await expect(page).not.toHaveURL(/\/auth\//, { timeout: 5_000 });
});

test('caretaker role lands on /care', async ({ world, page }) => {
	await page.goto(world.server.baseURL + '/auth/login');
	await page.getByRole('button', { name: /Explore as Caretaker/i }).click();
	await expect(page).toHaveURL(/\/care/, { timeout: 10_000 });
});

// ─── 3. Demo bar visible and role switch works ────────────────────────────────

test('demo bar is visible and role switch works', async ({ world, page }) => {
	await page.goto(world.server.baseURL + '/auth/login');
	await page.getByRole('button', { name: /Explore as Admin/i }).click();
	await expect(page).not.toHaveURL(/auth\/login/, { timeout: 10_000 });

	// Demo bar must be present (contains "Viewing as" text)
	await expect(page.getByText(/Viewing as/i)).toBeVisible({ timeout: 8_000 });

	// Switch to member role via the select
	const roleSelect = page.locator('#demo-role');
	await roleSelect.selectOption('member');

	// Page should reload as member — still on app (not /care)
	await expect(page).not.toHaveURL(/\/care/, { timeout: 10_000 });
	await expect(page).not.toHaveURL(/auth\/login/, { timeout: 10_000 });

	// Demo bar still visible after role switch
	await expect(page.getByText(/Viewing as/i)).toBeVisible({ timeout: 8_000 });
});

// ─── 4. Write is blocked with read-only notice ────────────────────────────────

test('write attempt is blocked with read-only notice', async ({ world, page }) => {
	await page.goto(world.server.baseURL + '/auth/login');
	await page.getByRole('button', { name: /Explore as Admin/i }).click();
	await expect(page).not.toHaveURL(/auth\/login/, { timeout: 10_000 });

	// Navigate to admin users page and attempt to create a user
	await page.goto(world.server.baseURL + '/admin/users');
	await expect(page).toHaveURL(/admin\/users/, { timeout: 10_000 });

	await page.getByRole('button', { name: /new user/i }).click();
	const form = page.locator('form[action="?/create"]');
	await expect(form).toBeVisible({ timeout: 4_000 });

	await form.getByLabel(/display name/i).fill('Demo Block Test');
	await form.getByLabel(/username/i).fill('demo-block-test');
	// Use exact: true to avoid matching "Confirm password"
	await form.getByLabel('Password', { exact: true }).fill('demo-password-123');
	await form.getByRole('button', { name: /create user/i }).click();

	// The demo read-only hook redirects back with a notice cookie, triggering the toast.
	await expect(page.getByText(/read-only|wasn't saved/i).first()).toBeVisible({ timeout: 10_000 });

	// Reload and verify the user was NOT created
	await page.reload();
	const userRow = page.locator('div').filter({ hasText: /demo-block-test/ });
	await expect(userRow).toHaveCount(0, { timeout: 6_000 });
});

// ─── 5. Caretaker sees on-shift assigned companion ────────────────────────────

test('caretaker sees assigned companion on shift', async ({ world, page }) => {
	await page.goto(world.server.baseURL + '/auth/login');
	await page.getByRole('button', { name: /Explore as Caretaker/i }).click();
	await expect(page).toHaveURL(/\/care/, { timeout: 10_000 });

	// The seeded caretaker (Faye) is assigned to Ein with an active shift.
	// Use role=heading to avoid matching 'EinVault' in the nav.
	await expect(
		page.getByRole('heading', { name: SEED.companions.ein.name, exact: true })
	).toBeVisible({ timeout: 10_000 });
});

// ─── 6. Direct API write returns 403 with { demo: true } ─────────────────────

test('direct API write returns 403 json with demo flag', async ({ world, page }) => {
	await page.goto(world.server.baseURL + '/auth/login');
	await page.getByRole('button', { name: /Explore as Admin/i }).click();
	await expect(page).not.toHaveURL(/auth\/login/, { timeout: 10_000 });

	// POST to a write API endpoint — the demo read-only hook must intercept it
	const res = await page.request.post(
		world.server.baseURL + `/api/companions/${SEED.companions.ein.id}/reminders`,
		{
			data: { title: 'api-write-test', type: 'vet', dueAt: new Date().toISOString() },
			headers: { 'Content-Type': 'application/json' }
		}
	);
	expect(res.status()).toBe(403);
	const body = await res.json();
	expect(body).toHaveProperty('demo', true);
});

// ─── 7. Enriched content renders ─────────────────────────────────────────────

test('journal shows seeded photos and mood indicator', async ({ world, page }) => {
	await page.goto(world.server.baseURL + '/auth/login');
	await page.getByRole('button', { name: /Explore as Member/i }).click();
	await expect(page).not.toHaveURL(/auth\/login/, { timeout: 10_000 });

	// Navigate to Ein's journal list
	await page.goto(world.server.baseURL + `/${SEED.companions.ein.id}/journal`);
	await expect(page).toHaveURL(new RegExp(SEED.companions.ein.id), { timeout: 10_000 });

	// Mood indicator: seeded entries have moods — mood emojis have title=moodValue
	const moodSpan = page
		.locator(
			'span[title="great"], span[title="good"], span[title="meh"], span[title="off"], span[title="sick"]'
		)
		.first();
	await expect(moodSpan).toBeVisible({ timeout: 10_000 });

	// Photo thumbnails from seeded photos must appear
	const photoImg = page.locator('img[src*="/api/photos/journal/"]').first();
	await expect(photoImg).toBeVisible({ timeout: 10_000 });

	// Verify the photo URL resolves 200 (not 404)
	const photoSrc = await photoImg.getAttribute('src');
	expect(photoSrc).toBeTruthy();
	const photoRes = await page.request.get(world.server.baseURL + photoSrc!);
	expect(photoRes.status()).toBe(200);
});

test('weight page shows multiple weight points', async ({ world, page }) => {
	await page.goto(world.server.baseURL + '/auth/login');
	await page.getByRole('button', { name: /Explore as Member/i }).click();
	await expect(page).not.toHaveURL(/auth\/login/, { timeout: 10_000 });

	await page.goto(world.server.baseURL + `/${SEED.companions.ein.id}/health`);
	await expect(page).toHaveURL(new RegExp(SEED.companions.ein.id), { timeout: 10_000 });

	// Weight trend section should be present
	await expect(page.getByText('Weight trend')).toBeVisible({ timeout: 10_000 });

	// Seed has 5 weight entries for Ein; spot-check two distinct values
	await expect(page.getByText(/24\.2/).first()).toBeVisible({ timeout: 8_000 });
	await expect(page.getByText(/25\.6/).first()).toBeVisible({ timeout: 8_000 });
});

// ─── 8. Theme switch works in demo with no read-only toast ────────────────────

test('theme switch to dark works in demo without read-only toast', async ({ world, page }) => {
	await page.goto(world.server.baseURL + '/auth/login');
	await page.getByRole('button', { name: /Explore as Admin/i }).click();
	await expect(page).not.toHaveURL(/auth\/login/, { timeout: 10_000 });

	await page.goto(world.server.baseURL + '/settings');
	await expect(page).toHaveURL(/settings/, { timeout: 10_000 });

	// Click the "Dark mode" button in the appearance card
	await page.getByRole('button', { name: /dark mode/i }).click();

	// html element should get the dark class
	await expect(page.locator('html')).toHaveClass(/dark/, { timeout: 6_000 });

	// The read-only TOAST must NOT appear (theme write is a client cookie, not a POST).
	// The demo bar always shows "Read-only demo" but the toast has role="status".
	// "wasn't saved" appears only in the toast, not in the always-on banner.
	await expect(page.locator('[role="status"]').filter({ hasText: /wasn't saved/i })).toHaveCount(
		0,
		{
			timeout: 2_000
		}
	);

	// The einvault_theme cookie should be set to dark
	const cookies = await page.context().cookies();
	const themeCookie = cookies.find((c) => c.name === 'einvault_theme');
	expect(themeCookie).toBeDefined();
	expect(themeCookie?.value).toBe('dark');
});

// ─── 9. Auth attack surface closed ────────────────────────────────────────────

test('OIDC login route returns 404 in demo mode', async ({ world, page }) => {
	const res = await page.request.get(world.server.baseURL + '/auth/oidc/login');
	expect(res.status()).toBe(404);
});

test('password login POST does not create a session', async ({ world, page }) => {
	// Verify that the known demo seed password cannot create a real session.
	// The demoReadOnly hook intercepts POST /auth/login and redirects without
	// creating a session. Task 6 Step 1b also makes the login action return 404.
	//
	// Strategy: start with a clean browser context (no cookies), post the form
	// via page navigation, and verify we are NOT sent into the app interior.
	// If demo mode is working, the form POST must not create an einvault_session.
	const freshCtx = await page.context().browser()!.newContext({ baseURL: world.server.baseURL });
	const freshPage = await freshCtx.newPage();

	try {
		await freshPage.goto(world.server.baseURL + '/auth/login');

		// The login page in demo mode shows the role picker, not credentials.
		// Attempt to POST directly via fetch (the form is not rendered in demo mode).
		// Use page.evaluate to issue the fetch from the browser context (shares cookies/origin).
		const result = await freshPage.evaluate(
			async ({ url, username, password }) => {
				const fd = new FormData();
				fd.append('username', username);
				fd.append('password', password);
				const res = await fetch(url + '/auth/login', {
					method: 'POST',
					body: new URLSearchParams({ username, password }),
					headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
					redirect: 'follow'
				});
				return { status: res.status, url: res.url };
			},
			{ url: world.server.baseURL, username: SEED.admin.username, password: SEED.password }
		);

		// After following redirects, we must end up on the login or setup page,
		// NOT on any authenticated app route.
		expect(result.url).not.toMatch(/seed-comp|\/admin|\/settings|\/care/);

		// Check that no session cookie was set in the browser context.
		const cookies = await freshCtx.cookies(world.server.baseURL);
		const sessionCookie = cookies.find((c) => c.name === 'einvault_session');
		expect(sessionCookie).toBeUndefined();
	} finally {
		await freshCtx.close();
	}
});
