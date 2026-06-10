import { test, expect } from '../lib/fixtures';
import { request as pwRequest } from '@playwright/test';
import { SEED } from '../lib/seed';

// The server runs in UTC; build tomorrow's date string relative to UTC midnight.
function tomorrowDatetimeLocal(hour: number): string {
	const now = new Date();
	const tomorrow = new Date(
		Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1, hour, 0, 0)
	);
	const p = (n: number) => String(n).padStart(2, '0');
	return `${tomorrow.getUTCFullYear()}-${p(tomorrow.getUTCMonth() + 1)}-${p(tomorrow.getUTCDate())}T${p(tomorrow.getUTCHours())}:${p(tomorrow.getUTCMinutes())}`;
}

// YYYY-MM-DD for tomorrow in UTC (used to distinguish tomorrow's shift from today's).
function tomorrowUTC(): string {
	const now = new Date();
	const tomorrow = new Date(
		Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1)
	);
	const p = (n: number) => String(n).padStart(2, '0');
	return `${tomorrow.getUTCFullYear()}-${p(tomorrow.getUTCMonth() + 1)}-${p(tomorrow.getUTCDate())}`;
}

test.describe('shifts', () => {
	test('admin adds a shift for seed-caretaker', async ({ asAdmin }) => {
		await asAdmin.goto('/admin/users');
		await expect(asAdmin).toHaveURL(/\/admin\/users/, { timeout: 10_000 });

		// Find the seed-caretaker row and open the overflow menu.
		// The row contains both the displayName and the username badge.
		const caretakerRow = asAdmin
			.locator('div.px-6.py-4')
			.filter({ hasText: SEED.caretaker.displayName });
		await expect(caretakerRow).toBeVisible({ timeout: 8_000 });

		const menuButton = caretakerRow.getByRole('button', { name: /more actions/i });
		await menuButton.click();

		// Overflow menu is now open; click "Shifts".
		const shiftsMenuItem = asAdmin.getByRole('menuitem', { name: /shifts/i });
		await expect(shiftsMenuItem).toBeVisible({ timeout: 4_000 });
		await shiftsMenuItem.click();

		// The shifts management panel should now be visible for this user.
		// "Add shift" form is rendered inside the panel.
		// The startAt / endAt inputs have ids like shift-start-{userId}.
		// Use name attributes which are unique within the visible panel.
		const panel = caretakerRow.locator('div.rounded-lg.border.border-border.bg-muted\\/30');
		await expect(panel).toBeVisible({ timeout: 4_000 });

		const startInput = panel.locator('input[name="startAt"]');
		const endInput = panel.locator('input[name="endAt"]');
		const notesInput = panel.locator('input[name="notes"]');

		// Fill tomorrow 09:00–17:00. The form uses use:localDatetimes which converts
		// datetime-local values to ISO on formdata event (triggered by enhance).
		// Playwright fills the <input type="datetime-local"> directly; the action
		// fires when the form submits via enhance.
		await startInput.fill(tomorrowDatetimeLocal(9));
		await endInput.fill(tomorrowDatetimeLocal(17));
		await notesInput.fill('e2e-shift-note');

		await panel.getByRole('button', { name: /add shift/i }).click();

		// After submission the page re-loads (SvelteKit enhance invalidates loader).
		// The new shift should appear in the shifts list for the caretaker.
		// The panel re-opens because managingShiftsUserId stays set until "Close".
		// The shift is rendered as a row inside the same panel showing LocalTime dates.
		// We assert the note is visible (rendered as a muted text span next to the times).
		await expect(panel.getByText('e2e-shift-note')).toBeVisible({ timeout: 10_000 });
	});

	test('caretaker sees the upcoming shift on the settings page', async ({
		asAdmin,
		asCaretaker
	}) => {
		// First, ensure the shift exists — add it as admin.
		await asAdmin.goto('/admin/users');
		await expect(asAdmin).toHaveURL(/\/admin\/users/, { timeout: 10_000 });

		const caretakerRow = asAdmin
			.locator('div.px-6.py-4')
			.filter({ hasText: SEED.caretaker.displayName });
		await expect(caretakerRow).toBeVisible({ timeout: 8_000 });

		await caretakerRow.getByRole('button', { name: /more actions/i }).click();
		await asAdmin.getByRole('menuitem', { name: /shifts/i }).click();

		const panel = caretakerRow.locator('div.rounded-lg.border.border-border.bg-muted\\/30');
		await expect(panel).toBeVisible({ timeout: 4_000 });

		// Only add if the note isn't already there (idempotent guard).
		const alreadyPresent = await panel.getByText('e2e-shift-note').isVisible();
		if (!alreadyPresent) {
			await panel.locator('input[name="startAt"]').fill(tomorrowDatetimeLocal(9));
			await panel.locator('input[name="endAt"]').fill(tomorrowDatetimeLocal(17));
			await panel.locator('input[name="notes"]').fill('e2e-shift-note');
			await panel.getByRole('button', { name: /add shift/i }).click();
			await expect(panel.getByText('e2e-shift-note')).toBeVisible({ timeout: 10_000 });
		}

		// Now check the caretaker's settings "My Shifts" card.
		// Route: /care/settings → card id="shifts"
		await asCaretaker.goto('/care/settings');
		await expect(asCaretaker).toHaveURL(/\/care\/settings/, { timeout: 10_000 });

		// The shifts card lists upcoming shifts. Tomorrow's shift should appear.
		// The seed active shift ends today; the new shift is tomorrow — both upcoming.
		const shiftsCard = asCaretaker.locator('#shifts');
		await expect(shiftsCard).toBeVisible({ timeout: 8_000 });

		// Assert the card is not in the "no upcoming shifts" empty state.
		await expect(shiftsCard.getByText(/no upcoming shifts/i)).toHaveCount(0);

		// The card header badge shows the total count of upcoming shifts (≥ 2).
		// Badge renders as a <div> with CVA classes containing "rounded-full".
		// The badge is `<Badge variant="secondary" class="ml-auto">{count}</Badge>`.
		// Locate by the rounded-full class which is unique to Badge components.
		// The seed active shift + new shift = 2 total upcoming.
		const countBadge = shiftsCard.locator('div[class*="rounded-full"]').first();
		const countText = await countBadge.textContent({ timeout: 8_000 });
		expect(parseInt(countText ?? '0', 10)).toBeGreaterThanOrEqual(2);

		// Shift rows are <button> elements inside the card (accordion: expanding one
		// collapses the other, and notes render only while expanded). Picking the row
		// by rendered date numbers is timezone-dependent — the seed shift crosses UTC
		// midnight on evening runs and then also displays tomorrow's day number. So
		// expand each candidate row in turn until the note shows up.
		const [year] = tomorrowUTC().split('-');
		const candidates = shiftsCard.getByRole('button').filter({ hasText: new RegExp(year) });
		const count = await candidates.count();
		expect(count).toBeGreaterThan(0);

		let revealed = false;
		for (let i = 0; i < count && !revealed; i++) {
			await candidates.nth(i).click();
			revealed = await shiftsCard
				.getByText('e2e-shift-note')
				.waitFor({ state: 'visible', timeout: 2_000 })
				.then(() => true)
				.catch(() => false);
		}
		expect(revealed).toBe(true);
	});

	test('ICS export returns valid calendar with the new shift', async ({ asAdmin, asCaretaker }) => {
		// Ensure the shift exists (same pattern as test 2 — add if missing).
		await asAdmin.goto('/admin/users');
		await expect(asAdmin).toHaveURL(/\/admin\/users/, { timeout: 10_000 });

		const caretakerRow = asAdmin
			.locator('div.px-6.py-4')
			.filter({ hasText: SEED.caretaker.displayName });
		await expect(caretakerRow).toBeVisible({ timeout: 8_000 });

		await caretakerRow.getByRole('button', { name: /more actions/i }).click();
		await asAdmin.getByRole('menuitem', { name: /shifts/i }).click();

		const panel = caretakerRow.locator('div.rounded-lg.border.border-border.bg-muted\\/30');
		await expect(panel).toBeVisible({ timeout: 4_000 });

		const alreadyPresent = await panel.getByText('e2e-shift-note').isVisible();
		if (!alreadyPresent) {
			await panel.locator('input[name="startAt"]').fill(tomorrowDatetimeLocal(9));
			await panel.locator('input[name="endAt"]').fill(tomorrowDatetimeLocal(17));
			await panel.locator('input[name="notes"]').fill('e2e-shift-note');
			await panel.getByRole('button', { name: /add shift/i }).click();
			await expect(panel.getByText('e2e-shift-note')).toBeVisible({ timeout: 10_000 });
		}

		// Caretaker fetches the ICS export.
		const res = await asCaretaker.request.get('/api/shifts/export.ics');
		expect(res.status()).toBe(200);

		const contentType = res.headers()['content-type'] ?? '';
		expect(contentType).toContain('text/calendar');

		const body = await res.text();
		expect(body).toContain('BEGIN:VCALENDAR');
		expect(body).toContain('BEGIN:VEVENT');

		// DTSTART line must match the iCal basic format (DTSTART:YYYYMMDDTHHmmssZ)
		expect(body).toMatch(/DTSTART[^\n]*\d{8}T\d{6}/);

		// The new shift's notes are exported in DESCRIPTION.
		// src/routes/api/shifts/export.ics/+server.ts: `if (shift.notes) lines.push(\`DESCRIPTION:...\`)`
		expect(body).toContain('e2e-shift-note');
	});

	test('ICS export: member gets 403', async ({ asMember }) => {
		const res = await asMember.request.get('/api/shifts/export.ics');
		expect(res.status()).toBe(403);
	});

	test('ICS export: anonymous gets redirected to login', async ({ app }) => {
		// The handler calls `redirect(302, '/auth/login')` when there is no user.
		// Create a fresh, unauthenticated request context.
		const ctx = await pwRequest.newContext({ baseURL: app.server.baseURL });
		const res = await ctx.get('/api/shifts/export.ics', { maxRedirects: 0 });
		// The server emits a 302 redirect to /auth/login for unauthenticated requests.
		expect(res.status()).toBe(302);
		const location = res.headers()['location'] ?? '';
		expect(location).toMatch(/\/auth\/login/);
		await ctx.dispose();
	});
});
