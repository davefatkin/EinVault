import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { createSeededDb } from '../lib/seed';
import { startAppServer, type AppServer } from '../lib/app-server';
import { getFreePort } from '../lib/ports';
import { startOidcFake, type OidcFake } from '../fakes/oidc';

const REPO_ROOT = path.resolve(import.meta.dirname, '../..');

interface OidcWorld {
	server: AppServer;
	oidc: OidcFake;
	dir: string;
}

/**
 * Boot an app server with the OIDC fake and a seeded DB.
 * `extraEnv` is merged on top of the base OIDC env; pass an empty object (or
 * override OIDC_ISSUER_URL to undefined) when OIDC should be disabled.
 */
async function bootOidcWorld(
	label: string,
	extraEnv: Record<string, string>,
	withOidc = true
): Promise<OidcWorld> {
	const dir = path.join(
		REPO_ROOT,
		'.test-data',
		`oidc-variants-${label}-${Date.now()}-${Math.random().toString(36).slice(2)}`
	);
	const dbPath = createSeededDb(dir);

	let oidc: OidcFake | null = null;
	if (withOidc) {
		oidc = await startOidcFake();
	}

	const appPort = await getFreePort();

	const baseOidcEnv: Record<string, string> = withOidc
		? {
				OIDC_ISSUER_URL: oidc!.issuerUrl,
				OIDC_CLIENT_ID: 'einvault-test',
				OIDC_CLIENT_SECRET: 'einvault-test-secret',
				OIDC_REDIRECT_URI: `http://localhost:${appPort}/auth/oidc/callback`,
				OIDC_STATE_SECRET: 'e2e-oidc-state-secret-not-for-production',
				OIDC_ALLOW_INSECURE_HTTP: 'true',
				OIDC_PROVIDER_NAME: 'MockIdP'
			}
		: {};

	let server: AppServer;
	try {
		server = await startAppServer({
			dbPath,
			env: {
				PORT: String(appPort),
				...baseOidcEnv,
				...extraEnv
			}
		});
	} catch (err) {
		if (oidc) await oidc.stop();
		fs.rmSync(dir, { recursive: true, force: true });
		throw err;
	}

	// Return a stub OidcFake when OIDC is disabled so callers don't have to
	// branch; the stub's stop() is a no-op.
	const noopOidc: OidcFake = {
		url: '',
		issuerUrl: '',
		setClaims() {},
		reset() {},
		stop: async () => {}
	};

	return { server, oidc: oidc ?? noopOidc, dir };
}

async function teardown(world: OidcWorld) {
	await world.server.stop();
	await world.oidc.stop();
	fs.rmSync(world.dir, { recursive: true, force: true });
}

// ─── Test 1: signup denied ─────────────────────────────────────────────────

test('oidc-variants: signup denied when OIDC_ALLOW_SIGNUP=false', async ({ page }) => {
	const world = await bootOidcWorld('signup-denied', { OIDC_ALLOW_SIGNUP: 'false' });
	try {
		world.oidc.setClaims({
			sub: 'variant-sub-1',
			email: 'variant1@example.com',
			preferred_username: 'variantuser1',
			name: 'Variant User 1'
		});

		await page.goto(world.server.baseURL + '/auth/login');
		await page.getByRole('link', { name: /sign in with mockidp/i }).click();

		// Callback redirects back to /auth/login?error=oidc_not_provisioned — must
		// land on an /auth/* page, NOT create a session.
		await expect(page).toHaveURL(/\/auth\//, { timeout: 15_000 });

		// The error query param is present in the URL.
		await expect(page).toHaveURL(/error=oidc_not_provisioned/);

		// Navigating to the app root must still redirect to login (no session).
		await page.goto(world.server.baseURL + '/');
		await expect(page).toHaveURL(/\/auth\/login/, { timeout: 10_000 });
	} finally {
		await teardown(world);
	}
});

// ─── Test 2: default role = caretaker ─────────────────────────────────────

test('oidc-variants: new user gets caretaker role when OIDC_DEFAULT_ROLE=caretaker', async ({
	page
}) => {
	const world = await bootOidcWorld('default-caretaker', {
		OIDC_ALLOW_SIGNUP: 'true',
		OIDC_DEFAULT_ROLE: 'caretaker'
	});
	try {
		world.oidc.setClaims({
			sub: 'variant-sub-2',
			email: 'variant2@example.com',
			preferred_username: 'variantuser2',
			name: 'Variant User 2'
		});

		await page.goto(world.server.baseURL + '/auth/login');
		await page.getByRole('link', { name: /sign in with mockidp/i }).click();

		// Caretakers are redirected to /care after login.
		await expect(page).toHaveURL(/\/care/, { timeout: 15_000 });

		// The caretaker layout badge confirms the role in the UI.
		await expect(page.getByText(/caretaker/i).first()).toBeVisible({ timeout: 5_000 });
	} finally {
		await teardown(world);
	}
});

// ─── Test 3: admin group grants admin role ─────────────────────────────────

test('oidc-variants: admin group membership grants admin role', async ({ page }) => {
	const world = await bootOidcWorld('admin-group-grants', {
		OIDC_ALLOW_SIGNUP: 'true',
		OIDC_ADMIN_GROUPS: 'einvault-admins'
	});
	try {
		world.oidc.setClaims({
			sub: 'variant-sub-3',
			email: 'variant3@example.com',
			preferred_username: 'variantuser3',
			name: 'Variant User 3',
			groups: ['einvault-admins']
		});

		await page.goto(world.server.baseURL + '/auth/login');
		await page.getByRole('link', { name: /sign in with mockidp/i }).click();

		// Must clear /auth/* before navigating further.
		await expect(page).not.toHaveURL(/\/auth\//, { timeout: 15_000 });

		// Admin page must render (not 403).
		await page.goto(world.server.baseURL + '/admin/users');
		// The admin users page has an h1 with the localised "Users" title and a
		// "New User" button — either confirms the page rendered for an admin.
		await expect(page.getByRole('heading', { name: /users/i })).toBeVisible({ timeout: 10_000 });
		await expect(page.getByRole('button', { name: /new user/i })).toBeVisible();
	} finally {
		await teardown(world);
	}
});

// ─── Test 4: group absence demotes to member ───────────────────────────────

test('oidc-variants: group absence demotes admin to member', async ({ page }) => {
	const world = await bootOidcWorld('admin-group-demote', {
		OIDC_ALLOW_SIGNUP: 'true',
		OIDC_ADMIN_GROUPS: 'einvault-admins'
	});
	try {
		const sub = 'variant-sub-4';

		// ── First login: WITH the admin group ──────────────────────────────
		world.oidc.setClaims({
			sub,
			email: 'variant4@example.com',
			preferred_username: 'variantuser4',
			name: 'Variant User 4',
			groups: ['einvault-admins']
		});

		await page.goto(world.server.baseURL + '/auth/login');
		await page.getByRole('link', { name: /sign in with mockidp/i }).click();
		await expect(page).not.toHaveURL(/\/auth\//, { timeout: 15_000 });

		// Verify admin access granted.
		await page.goto(world.server.baseURL + '/admin/users');
		await expect(page.getByRole('heading', { name: /users/i })).toBeVisible({ timeout: 10_000 });

		// Sign out.
		await page.goto(world.server.baseURL + '/settings');
		await expect(page).toHaveURL(/settings/, { timeout: 10_000 });
		await page.getByRole('button', { name: /sign out/i }).click();
		await expect(page).toHaveURL(/auth\/login/, { timeout: 10_000 });

		// ── Second login: WITHOUT the group → role demoted to member ───────
		world.oidc.setClaims({
			sub,
			email: 'variant4@example.com',
			preferred_username: 'variantuser4',
			name: 'Variant User 4'
			// no groups claim
		});

		await page.getByRole('link', { name: /sign in with mockidp/i }).click();
		await expect(page).not.toHaveURL(/\/auth\//, { timeout: 15_000 });

		// /admin/users must now return 403.
		await page.goto(world.server.baseURL + '/admin/users');
		await expect(page).toHaveURL(/admin\/users/, { timeout: 10_000 });
		// SvelteKit error pages carry the HTTP status as visible text.
		await expect(page.getByText(/403/)).toBeVisible({ timeout: 5_000 });
	} finally {
		await teardown(world);
	}
});

// ─── Test 5: OIDC disabled — no "Sign in with" button ─────────────────────

test('oidc-variants: no SSO button when OIDC is not configured', async ({ page }) => {
	// Boot without OIDC: pass withOidc=false so no fake is started and no OIDC
	// env vars are injected.
	const world = await bootOidcWorld('oidc-disabled', {}, false);
	try {
		await page.goto(world.server.baseURL + '/auth/login');

		// The OIDC link only renders when oidcEnabled is true on the page data.
		// With no OIDC env vars, the link must not appear at all.
		await expect(page.getByRole('link', { name: /sign in with/i })).toHaveCount(0);
	} finally {
		await teardown(world);
	}
});
