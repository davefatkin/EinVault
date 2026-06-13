import { test as base, expect, type Page } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { createSeededDb, SEED } from '../lib/seed';
import { startAppServer, type AppServer } from '../lib/app-server';
import { startSmtpSink, type SmtpSink } from '../fakes/smtp';
import { startNtfyFake, type NtfyFake } from '../fakes/ntfy';
import type { ParsedMail } from 'mailparser';

const REPO_ROOT = path.resolve(import.meta.dirname, '../..');

// mailparser types .to as AddressObject | AddressObject[]; flatten either shape.
function toText(to: ParsedMail['to']): string {
	return [to ?? []]
		.flat()
		.map((a) => a.text)
		.join(', ');
}

// ---------------------------------------------------------------------------
// World fixture — one per test (full isolation)
// ---------------------------------------------------------------------------

interface NotifyWorld {
	server: AppServer;
	smtp: SmtpSink;
	ntfy: NtfyFake;
}

const test = base.extend<{ world: NotifyWorld }>({
	// eslint-disable-next-line no-empty-pattern
	world: async ({}, use, testInfo) => {
		const dir = path.join(
			REPO_ROOT,
			'.test-data',
			`notifications-${testInfo.workerIndex}-${testInfo.testId}`
		);
		const smtp = await startSmtpSink();
		const ntfy = await startNtfyFake();
		const dbPath = createSeededDb(dir);
		let server: AppServer;
		try {
			server = await startAppServer({
				dbPath,
				env: {
					NOTIFY_SCAN_INTERVAL_MS: '250',
					SMTP_HOST: '127.0.0.1',
					SMTP_PORT: String(smtp.port),
					SMTP_SECURE: 'false',
					SMTP_FROM: 'einvault-test@example.com',
					NTFY_URL: ntfy.url
				}
			});
		} catch (err) {
			await server!?.stop();
			await smtp.stop();
			await ntfy.stop();
			fs.rmSync(dir, { recursive: true, force: true });
			throw err;
		}
		await use({ server, smtp, ntfy });
		// Teardown: server first, then fakes, then data dir.
		await server.stop();
		await smtp.stop();
		await ntfy.stop();
		fs.rmSync(dir, { recursive: true, force: true });
	}
});

// ---------------------------------------------------------------------------
// Inline login helper
// ---------------------------------------------------------------------------

async function login(page: Page, baseURL: string, username: string): Promise<void> {
	await page.goto(baseURL + '/auth/login');
	await page.getByLabel('Username').fill(username);
	await page.getByLabel('Password').fill(SEED.password);
	await page.getByRole('button', { name: 'Sign in' }).click();
	await expect(page.getByLabel('Username')).toHaveCount(0, { timeout: 10_000 });
}

// ---------------------------------------------------------------------------
// Date helpers
// ---------------------------------------------------------------------------

/** One minute ago as datetime-local string — reminder is immediately overdue. */
function justPast(): string {
	const d = new Date(Date.now() - 60_000);
	const pad = (n: number) => String(n).padStart(2, '0');
	return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/**
 * A datetime-local string for a time ~9 hours from now. The seed DB has an
 * active shift from -1h to +8h; the new test shift must start after +8h to
 * avoid an overlap conflict while still being within the 24h lead window.
 */
function inNineHours(): string {
	const d = new Date(Date.now() + 9 * 60 * 60 * 1000);
	const pad = (n: number) => String(n).padStart(2, '0');
	return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** Ten hours from now — end of a shift that starts in nine hours. */
function inTenHours(): string {
	const d = new Date(Date.now() + 10 * 60 * 60 * 1000);
	const pad = (n: number) => String(n).padStart(2, '0');
	return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/**
 * Save notification settings via a fetch to the SvelteKit action. Playwright's
 * `page.evaluate` runs inside the browser context so the session cookie is
 * automatically included — no CSRF workaround needed.
 */
async function saveNotificationSettings(
	page: Page,
	baseURL: string,
	opts: { reminderEmail?: boolean; shiftEmail?: boolean; ntfyTopic?: string }
): Promise<void> {
	const fd = new URLSearchParams();
	if (opts.reminderEmail) fd.append('notifyReminderEmail', 'on');
	if (opts.shiftEmail) fd.append('notifyShiftEmail', 'on');
	if (opts.ntfyTopic) fd.append('ntfyTopic', opts.ntfyTopic);

	const status = await page.evaluate(
		async ([url, body]) => {
			const r = await fetch(url, {
				method: 'POST',
				headers: { 'content-type': 'application/x-www-form-urlencoded' },
				body,
				credentials: 'include'
			});
			return r.status;
		},
		[baseURL + '/settings?/notifications', fd.toString()] as [string, string]
	);
	if (status !== 200) throw new Error(`saveNotificationSettings: HTTP ${status}`);
}

// ---------------------------------------------------------------------------
// Test 1 + 2: reminder due fires email AND ntfy push; dedup stays at 1
// ---------------------------------------------------------------------------

test('reminder due fires email and ntfy push', async ({ world, page }) => {
	await login(page, world.server.baseURL, SEED.member.username);

	// Navigate to settings so the page is on the right origin before calling
	// saveNotificationSettings (which uses page.evaluate to post via fetch).
	await page.goto(world.server.baseURL + '/settings');
	await expect(page).toHaveURL(/\/settings/, { timeout: 10_000 });

	// Enable reminder email and set ntfy topic via the settings action.
	// The component uses an auto-submit onchange pattern; we call the action
	// directly to avoid Svelte 5 reactivity timing quirks in Playwright.
	await saveNotificationSettings(page, world.server.baseURL, {
		reminderEmail: true,
		ntfyTopic: 'e2e-topic-1'
	});

	// Create a reminder due right now on Biscuit's reminders page.
	const biscuitRemindersUrl = world.server.baseURL + `/${SEED.companions.biscuit.id}/reminders`;
	await page.goto(biscuitRemindersUrl);
	await page.getByRole('button', { name: 'Add Reminder' }).click();
	await page.locator('#title').fill('e2e-notify-rem');
	await page.locator('#dueAt').fill(justPast());
	await page.getByRole('button', { name: 'Save Reminder' }).click();
	await expect(page.getByRole('button', { name: 'Save Reminder' })).toHaveCount(0, {
		timeout: 8_000
	});

	// Wait for the scheduler to fire (NOTIFY_SCAN_INTERVAL_MS=250; allow 20s).
	// mailparser exposes .to as an AddressObject; use .text to get the address string.
	const mail = await world.smtp.waitForMail(
		(m) =>
			toText(m.to).includes('seed-member@example.com') &&
			(m.subject ?? '').includes('e2e-notify-rem'),
		20_000
	);

	// Subject: "Reminder: e2e-notify-rem"
	expect(mail.subject).toMatch(/Reminder: e2e-notify-rem/);
	// Body: "{companion} has a reminder due: {title}" → contains companion name
	const bodyText = mail.text ?? '';
	expect(bodyText).toMatch(/Biscuit/);
	expect(bodyText).toMatch(/e2e-notify-rem/);
	// Recipient
	expect(toText(mail.to)).toContain('seed-member@example.com');

	// ntfy push
	const publish = await world.ntfy.waitForPublish(
		(p) => p.topic === 'e2e-topic-1' && (p.title ?? '').includes('e2e-notify-rem'),
		20_000
	);
	expect(publish.topic).toBe('e2e-topic-1');
	// ntfy title is built with email.reminder.subject key: "Reminder: {title}"
	expect(publish.title).toMatch(/Reminder: e2e-notify-rem/);

	// ------------------------------------------------------------------
	// Dedup: after ~4 scan cycles (1s) the count must not have grown
	// ------------------------------------------------------------------
	const reminderMailMatcher = (m: import('mailparser').ParsedMail) =>
		toText(m.to).includes('seed-member@example.com') &&
		(m.subject ?? '').includes('e2e-notify-rem');

	await expect
		.poll(() => world.smtp.messages.filter(reminderMailMatcher).length, {
			timeout: 1_500,
			intervals: [200]
		})
		.toBe(1);

	const reminderPublishMatcher = (p: import('../fakes/ntfy').NtfyPublish) =>
		p.topic === 'e2e-topic-1' && (p.title ?? '').includes('e2e-notify-rem');

	expect(world.ntfy.publishes.filter(reminderPublishMatcher)).toHaveLength(1);
});

// ---------------------------------------------------------------------------
// Test 3: shift start email reaches seed-caretaker
// ---------------------------------------------------------------------------

test('shift start email fires for caretaker', async ({ world, browser }) => {
	// Log in as seed-caretaker and enable shift-email via the settings action.
	const caretakerCtx = await browser.newContext({ baseURL: world.server.baseURL });
	const caretakerPage = await caretakerCtx.newPage();
	await login(caretakerPage, world.server.baseURL, SEED.caretaker.username);

	// Call the caretaker settings notifications action directly.
	const fd = new URLSearchParams();
	fd.append('notifyShiftEmail', 'on');
	const status = await caretakerPage.evaluate(
		async ([url, body]) => {
			const r = await fetch(url, {
				method: 'POST',
				headers: { 'content-type': 'application/x-www-form-urlencoded' },
				body,
				credentials: 'include'
			});
			return r.status;
		},
		[world.server.baseURL + '/care/settings?/notifications', fd.toString()] as [string, string]
	);
	if (status !== 200) throw new Error(`caretaker notifications save: HTTP ${status}`);
	await caretakerCtx.close();

	// Log in as admin to add a shift for seed-caretaker starting in ~1h (inside
	// the 24h lead window).
	const adminCtx = await browser.newContext({ baseURL: world.server.baseURL });
	const adminPage = await adminCtx.newPage();
	await login(adminPage, world.server.baseURL, SEED.admin.username);

	await adminPage.goto(world.server.baseURL + '/admin/users');
	await expect(adminPage).toHaveURL(/\/admin\/users/, { timeout: 10_000 });

	const caretakerRow = adminPage
		.locator('div.px-6.py-4')
		.filter({ hasText: SEED.caretaker.displayName });
	await expect(caretakerRow).toBeVisible({ timeout: 8_000 });

	await caretakerRow.getByRole('button', { name: /manage/i }).click();
	const dialog = adminPage.getByRole('dialog');
	await expect(dialog).toBeVisible({ timeout: 4_000 });

	const addForm = dialog.locator('form[action="?/addShift"]');
	await expect(addForm).toBeVisible({ timeout: 4_000 });

	await addForm.locator('input[name="startAt"]').fill(inNineHours());
	await addForm.locator('input[name="endAt"]').fill(inTenHours());
	await addForm.locator('input[name="notes"]').fill('e2e-notify-shift');
	await addForm.getByRole('button', { name: /add shift/i }).click();

	// After submission the drawer stays open and the new shift row appears.
	await expect(dialog.getByText('e2e-notify-shift')).toBeVisible({ timeout: 10_000 });
	await adminCtx.close();

	// Wait for the scheduler to emit the shift-start email.
	// Subject: "Shift starting soon: {caretaker}" → "Shift starting soon: Seed Caretaker"
	// mailparser exposes .to as an AddressObject; use .text for the address string.
	const mail = await world.smtp.waitForMail(
		(m) =>
			toText(m.to).includes('seed-caretaker@example.com') &&
			(m.subject ?? '').toLowerCase().includes('shift starting soon'),
		20_000
	);

	expect(mail.subject).toMatch(/Shift starting soon: Seed Caretaker/i);
	expect(toText(mail.to)).toContain('seed-caretaker@example.com');
	// Body: "{caretaker} begins a care shift on {start}."
	const bodyText = mail.text ?? '';
	expect(bodyText).toMatch(/Seed Caretaker/);
	expect(bodyText).toMatch(/begins a care shift/);
});

// Regression (#113): with email disabled and ntfy enabled, the notifications
// card lead-in must describe push, not email.
base('notifications card describes push when only ntfy is enabled', async ({ page }, testInfo) => {
	const dir = path.join(
		REPO_ROOT,
		'.test-data',
		`notif-ntfyonly-${testInfo.workerIndex}-${testInfo.testId}`
	);
	const ntfy = await startNtfyFake();
	const dbPath = createSeededDb(dir);
	const server = await startAppServer({ dbPath, env: { NTFY_URL: ntfy.url } });
	try {
		await login(page, server.baseURL, SEED.member.username);
		await page.goto(server.baseURL + '/settings');
		await expect(page.getByText('Get push notifications from EinVault')).toBeVisible({
			timeout: 8_000
		});
		await expect(page.getByText('Get emails from EinVault')).toHaveCount(0);
		// The ntfy topic field is present (proves we're looking at the right card).
		await expect(page.getByLabel('ntfy topic')).toBeVisible({ timeout: 8_000 });
	} finally {
		await server.stop();
		await ntfy.stop();
		fs.rmSync(dir, { recursive: true, force: true });
	}
});
