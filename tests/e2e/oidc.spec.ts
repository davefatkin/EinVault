import { test as base, expect } from '@playwright/test';
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
}

const test = base.extend<{ world: OidcWorld }>({
	// eslint-disable-next-line no-empty-pattern
	world: async ({}, use, testInfo) => {
		const dir = path.join(
			REPO_ROOT,
			'.test-data',
			`oidc-${testInfo.workerIndex}-${testInfo.testId}`
		);
		const oidc = await startOidcFake();
		const appPort = await getFreePort();
		const dbPath = createSeededDb(dir);
		let server: AppServer;
		try {
			server = await startAppServer({
				dbPath,
				env: {
					PORT: String(appPort),
					OIDC_ISSUER_URL: oidc.issuerUrl,
					OIDC_CLIENT_ID: 'einvault-test',
					OIDC_CLIENT_SECRET: 'einvault-test-secret',
					OIDC_REDIRECT_URI: `http://localhost:${appPort}/auth/oidc/callback`,
					OIDC_STATE_SECRET: 'e2e-oidc-state-secret-not-for-production',
					OIDC_ALLOW_INSECURE_HTTP: 'true',
					OIDC_ALLOW_SIGNUP: 'true',
					OIDC_PROVIDER_NAME: 'MockIdP'
				}
			});
		} catch (err) {
			// Teardown below never runs if startup throws; don't leak the IdP.
			await oidc.stop();
			fs.rmSync(dir, { recursive: true, force: true });
			throw err;
		}
		await use({ server, oidc });
		await server.stop();
		await oidc.stop();
		fs.rmSync(dir, { recursive: true, force: true });
	}
});

test('logs in a new user via OIDC signup', async ({ world, page }) => {
	world.oidc.setClaims({
		sub: 'mock-sub-1',
		email: 'oidc-user@example.com',
		preferred_username: 'oidcuser',
		name: 'OIDC User'
	});
	await page.goto(world.server.baseURL + '/auth/login');
	// The OIDC button is a <Button> inside an <a href="/auth/oidc/login">.
	// Playwright resolves the accessible name from the button text content.
	await page.getByRole('link', { name: /sign in with mockidp/i }).click();
	// Mock IdP auto-approves and redirects back through the callback.
	// Wait until the browser lands outside every /auth/* path — /auth/oidc/login
	// would not match the weaker /auth\/login/ pattern, so we need this tighter check.
	await expect(page).not.toHaveURL(/\/auth\//, { timeout: 15_000 });
});

test('existing OIDC user logs back in with same identity', async ({ world, page }) => {
	world.oidc.setClaims({
		sub: 'mock-sub-2',
		email: 'oidc-user-2@example.com',
		preferred_username: 'oidcuser2',
		name: 'OIDC User Two'
	});
	// First login creates the account.
	await page.goto(world.server.baseURL + '/auth/login');
	await page.getByRole('link', { name: /sign in with mockidp/i }).click();
	// Wait until the browser lands outside every /auth/* path — confirms the full
	// OAuth round-trip completed and the app accepted the session.
	await expect(page).not.toHaveURL(/\/auth\//, { timeout: 15_000 });

	// Navigate to settings (always accessible with any number of companions)
	// so that the Sign Out button is visible in the app nav.
	await page.goto(world.server.baseURL + '/settings');
	await expect(page).toHaveURL(/settings/, { timeout: 10_000 });

	// Log out via the Sign Out button in the app navigation.
	await page.getByRole('button', { name: /sign out/i }).click();
	await expect(page).toHaveURL(/auth\/login/, { timeout: 10_000 });

	// Log in again — must reuse the account, not error or duplicate.
	await page.getByRole('link', { name: /sign in with mockidp/i }).click();
	// Same check: must clear all /auth/* URLs to confirm successful re-login.
	await expect(page).not.toHaveURL(/\/auth\//, { timeout: 15_000 });
});
