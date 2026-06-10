import { test as base, type BrowserContext, type Page, expect } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { createSeededDb, SEED, type Role } from './seed';
import { startAppServer, type AppServer } from './app-server';
import { startSmtpSink, type SmtpSink } from '../fakes/smtp';

const REPO_ROOT = path.resolve(import.meta.dirname, '../..');

export interface AppWorker {
	server: AppServer;
	smtp: SmtpSink;
	dataDir: string;
	/** Path to cached storageState for a role, logging in on first use. */
	stateFor(role: Role, browser: import('@playwright/test').Browser): Promise<string>;
}

type WorkerFixtures = { app: AppWorker };
type TestFixtures = { asAdmin: Page; asMember: Page; asCaretaker: Page };

export const test = base.extend<TestFixtures, WorkerFixtures>({
	app: [
		// eslint-disable-next-line no-empty-pattern
		async ({}, use, workerInfo) => {
			const dataDir = path.join(REPO_ROOT, '.test-data', `worker-${workerInfo.workerIndex}`);
			const smtp = await startSmtpSink();
			const dbPath = createSeededDb(dataDir);
			let server: AppServer;
			try {
				server = await startAppServer({
					dbPath,
					env: {
						SMTP_HOST: '127.0.0.1',
						SMTP_PORT: String(smtp.port),
						SMTP_SECURE: 'false',
						SMTP_FROM: 'einvault-test@example.com'
					}
				});
			} catch (err) {
				// Teardown below never runs if startup throws; don't leak the sink
				// (CI retries would accumulate orphaned listeners).
				await smtp.stop();
				fs.rmSync(dataDir, { recursive: true, force: true });
				throw err;
			}

			// Cached storageState contract: tests must never invalidate sessions or
			// change passwords for the cached roles (admin/member/caretaker) — the
			// cookie in the state file would go stale for the rest of the worker.
			// Destructive flows use SEED.resetUser or a dedicated seed identity.
			const statePaths = new Map<Role, string>();
			const app: AppWorker = {
				server,
				smtp,
				dataDir,
				async stateFor(role, browser) {
					const cached = statePaths.get(role);
					if (cached) return cached;
					const user = SEED[role];
					const context = await browser.newContext({ baseURL: server.baseURL });
					const page = await context.newPage();
					await page.goto('/auth/login');
					await page.getByLabel('Username').fill(user.username);
					await page.getByLabel('Password').fill(SEED.password);
					await page.getByRole('button', { name: 'Sign in' }).click();
					// Login failure here is also the harness's "server sees the seeded
					// DB" assertion (guards resolveDbPath silent fallback).
					await expect(page.getByLabel('Username')).toHaveCount(0, { timeout: 10_000 });
					const statePath = path.join(dataDir, `state-${role}.json`);
					await context.storageState({ path: statePath });
					await context.close();
					statePaths.set(role, statePath);
					return statePath;
				}
			};

			await use(app);

			await server.stop();
			await smtp.stop();
			fs.rmSync(dataDir, { recursive: true, force: true });
		},
		{ scope: 'worker' }
	],

	asAdmin: async ({ app, browser }, use) => {
		const ctx: BrowserContext = await browser.newContext({
			baseURL: app.server.baseURL,
			storageState: await app.stateFor('admin', browser)
		});
		await use(await ctx.newPage());
		await ctx.close();
	},
	asMember: async ({ app, browser }, use) => {
		const ctx = await browser.newContext({
			baseURL: app.server.baseURL,
			storageState: await app.stateFor('member', browser)
		});
		await use(await ctx.newPage());
		await ctx.close();
	},
	asCaretaker: async ({ app, browser }, use) => {
		const ctx = await browser.newContext({
			baseURL: app.server.baseURL,
			storageState: await app.stateFor('caretaker', browser)
		});
		await use(await ctx.newPage());
		await ctx.close();
	}
});

export { expect } from '@playwright/test';
