import { test, expect } from '../lib/fixtures';
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

		// Find the seed-caretaker row and open the Manage drawer.
		const caretakerRow = asAdmin
			.locator('div.px-6.py-4')
			.filter({ hasText: SEED.caretaker.displayName });
		await expect(caretakerRow).toBeVisible({ timeout: 8_000 });

		await caretakerRow.getByRole('button', { name: /manage/i }).click();
		const dialog = asAdmin.getByRole('dialog');
		await expect(dialog).toBeVisible({ timeout: 4_000 });

		// The Shifts section's add-shift form lives inside the drawer.
		// (Scope to the addShift form so the inputs don't collide with an
		// edit-shift form if one were open.)
		const addForm = dialog.locator('form[action="?/addShift"]');
		await expect(addForm).toBeVisible({ timeout: 4_000 });

		// Fill tomorrow 09:00–17:00. The form uses use:localDatetimes which converts
		// datetime-local values to ISO on the formdata event (triggered by enhance).
		await addForm.locator('input[name="startAt"]').fill(tomorrowDatetimeLocal(9));
		await addForm.locator('input[name="endAt"]').fill(tomorrowDatetimeLocal(17));
		await addForm.locator('input[name="notes"]').fill('e2e-shift-note');

		await addForm.getByRole('button', { name: /add shift/i }).click();

		// After submission the page re-loads (enhance invalidates the loader) and the
		// drawer stays open; the new shift appears as a row inside the Shifts section,
		// showing the note next to the times.
		await expect(dialog.getByText('e2e-shift-note')).toBeVisible({ timeout: 10_000 });
	});

	test('caretaker sees the upcoming shift on the settings page', async ({
		asAdmin,
		asCaretaker
	}) => {
		// First, ensure the shift exists — add it as admin via the Manage drawer.
		await asAdmin.goto('/admin/users');
		await expect(asAdmin).toHaveURL(/\/admin\/users/, { timeout: 10_000 });

		const caretakerRow = asAdmin
			.locator('div.px-6.py-4')
			.filter({ hasText: SEED.caretaker.displayName });
		await expect(caretakerRow).toBeVisible({ timeout: 8_000 });

		await caretakerRow.getByRole('button', { name: /manage/i }).click();
		const dialog = asAdmin.getByRole('dialog');
		await expect(dialog).toBeVisible({ timeout: 4_000 });

		// Only add if the note isn't already there (idempotent guard).
		const alreadyPresent = await dialog.getByText('e2e-shift-note').isVisible();
		if (!alreadyPresent) {
			const addForm = dialog.locator('form[action="?/addShift"]');
			await addForm.locator('input[name="startAt"]').fill(tomorrowDatetimeLocal(9));
			await addForm.locator('input[name="endAt"]').fill(tomorrowDatetimeLocal(17));
			await addForm.locator('input[name="notes"]').fill('e2e-shift-note');
			await addForm.getByRole('button', { name: /add shift/i }).click();
			await expect(dialog.getByText('e2e-shift-note')).toBeVisible({ timeout: 10_000 });
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
});
