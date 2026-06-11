import type { Page } from '@playwright/test';
import { test, expect } from '../lib/fixtures';

// Locates the calendar feed URL input after Enable has been clicked.
// Svelte sets `value` as a DOM property (not HTML attribute), so attribute
// CSS selectors like [value*="..."] do not match. Instead locate by readonly +
// the font-mono class that the calendar card uses; sr-only readonly inputs are
// hidden, so the first visible one is always the feed URL.
async function enableAndGetUrl(page: Page, settingsPath: string): Promise<string> {
	await page.goto(settingsPath);
	await page.getByRole('button', { name: 'Enable calendar feed' }).click();
	// After the form POST the page reloads. The readonly calendar URL input
	// appears inside the revealed card section.
	const urlInput = page.locator('input[readonly].font-mono');
	await expect(urlInput).toBeVisible({ timeout: 8_000 });
	return await urlInput.inputValue();
}

// These tests mutate the shared asMember / asCaretaker user's calendar feed
// token (enable/regenerate/disable). Playwright runs a single spec file's tests
// serially in one worker by default, so they don't collide. Do NOT add
// describe parallel mode or run this file with --repeat-each across workers:
// duplicate copies would clobber each other's token on the same user.
test.describe('calendar feed', () => {
	test('member enable + fetch: 200 text/calendar with VCALENDAR wrapper', async ({
		asMember,
		app,
		browser
	}) => {
		const feedUrl = await enableAndGetUrl(asMember, '/settings');

		// URL shape
		expect(feedUrl).toMatch(/\/api\/calendar\/.+\/feed\.ics$/);

		// Cookieless GET
		const ctx = await browser.newContext({ baseURL: app.server.baseURL });
		const res = await ctx.request.get(feedUrl);
		expect(res.status()).toBe(200);
		expect(res.headers()['content-type']).toContain('text/calendar');
		const body = await res.text();
		expect(body).toContain('BEGIN:VCALENDAR');
		expect(body).toContain('END:VCALENDAR');
		await ctx.close();
	});

	test('wrong token returns 404', async ({ app, browser }) => {
		const ctx = await browser.newContext({ baseURL: app.server.baseURL });
		const res = await ctx.request.get('/api/calendar/not-a-real-token/feed.ics');
		expect(res.status()).toBe(404);
		await ctx.close();
	});

	test('type=reminder filter excludes health events', async ({ asMember, app, browser }) => {
		const feedUrl = await enableAndGetUrl(asMember, '/settings');
		const reminderUrl = feedUrl + '?type=reminder';

		const ctx = await browser.newContext({ baseURL: app.server.baseURL });
		const res = await ctx.request.get(reminderUrl);
		expect(res.status()).toBe(200);
		expect(res.headers()['content-type']).toContain('text/calendar');
		const body = await res.text();
		// health events carry "CATEGORIES:health" — should be absent when filtering by reminder
		expect(body).not.toContain('CATEGORIES:health');
		await ctx.close();
	});

	test('disable makes feed URL return 404', async ({ asMember, app, browser }) => {
		const feedUrl = await enableAndGetUrl(asMember, '/settings');

		// Confirm it works before disabling
		const ctx = await browser.newContext({ baseURL: app.server.baseURL });
		const before = await ctx.request.get(feedUrl);
		expect(before.status()).toBe(200);

		// Disable via the settings UI
		await asMember.getByRole('button', { name: 'Disable' }).click();

		// After disabling the same URL must 404
		const after = await ctx.request.get(feedUrl);
		expect(after.status()).toBe(404);
		await ctx.close();
	});

	test('old shifts export route is gone', async ({ app, browser }) => {
		const ctx = await browser.newContext({ baseURL: app.server.baseURL });
		const res = await ctx.request.get('/api/shifts/export.ics');
		expect(res.status()).toBe(404);
		await ctx.close();
	});

	test('caretaker feed: enable + fetch with type=shift returns VCALENDAR', async ({
		asCaretaker,
		app,
		browser
	}) => {
		const feedUrl = await enableAndGetUrl(asCaretaker, '/care/settings');

		// URL shape
		expect(feedUrl).toMatch(/\/api\/calendar\/.+\/feed\.ics$/);

		const shiftUrl = feedUrl + '?type=shift';
		const ctx = await browser.newContext({ baseURL: app.server.baseURL });
		const res = await ctx.request.get(shiftUrl);
		expect(res.status()).toBe(200);
		expect(res.headers()['content-type']).toContain('text/calendar');
		const body = await res.text();
		expect(body).toContain('BEGIN:VCALENDAR');
		expect(body).toContain('END:VCALENDAR');

		// The seeded caretaker has one active shift (started 1h ago, ends 8h from now).
		// getUpcomingShifts queries endAt >= now, so the active shift is included.
		expect(body).toContain('BEGIN:VEVENT');
		await ctx.close();
	});
});
