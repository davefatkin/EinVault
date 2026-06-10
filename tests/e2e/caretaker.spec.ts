import { test, expect } from '../lib/fixtures';

const BISCUIT = 'seed-comp-biscuit';
const WAFFLES = 'seed-comp-waffles';

// The server runs with TZ=UTC; localDateISO() uses the process timezone (UTC),
// so "today" from the server's perspective is the current UTC date.
function todayUTC(): string {
	const now = new Date();
	const p = (n: number) => String(n).padStart(2, '0');
	return `${now.getUTCFullYear()}-${p(now.getUTCMonth() + 1)}-${p(now.getUTCDate())}`;
}

test.describe('caretaker', () => {
	test('dashboard redirect + on-shift indicator', async ({ asCaretaker }) => {
		await asCaretaker.goto('/care');

		// /care redirects to the first assigned companion: Biscuit
		await expect(asCaretaker).toHaveURL(new RegExp(BISCUIT), { timeout: 10_000 });

		// On-shift banner renders because the seeded shift is active (started 1h ago)
		// The banner text starts with the i18n key 'layout.caretaker.onShift' = "On shift, ends"
		await expect(asCaretaker.getByText(/On shift, ends/i)).toBeVisible({ timeout: 8_000 });
	});

	test('unassigned companion blocked', async ({ asCaretaker }) => {
		// The load() in both the companion overview and log pages calls:
		//   if (!companions.find((c) => c.id === params.companionId)) error(403, ...)
		// companions is the list from the parent layout (assigned companions only).
		// Waffles is NOT assigned to seed-caretaker, so a 403 error page is returned.
		await asCaretaker.goto(`/care/${WAFFLES}/log`);

		// The load() guard calls error(403, ...) — SvelteKit renders an error page.
		// The URL stays on the requested path (error rendered in-place, no redirect).
		// Assert a 403-style indicator is visible (status code or the server message).
		await expect(asCaretaker.getByText(/403|not assigned/i)).toBeVisible({ timeout: 8_000 });
	});

	test('log activity', async ({ asCaretaker }) => {
		await asCaretaker.goto(`/care/${BISCUIT}/log`);

		// The log page renders the quick-log form when on shift.
		// Activity type pills: 'Walk' is selected by default ($state('walk')).
		// The label text rendered by TYPE_PILL_LABELS is "🦮 Walk" (icon + label).
		// Locate the radio input for walk and assert it is already checked, or
		// just click the pill label to be certain.
		const walkPill = asCaretaker.locator('label').filter({ hasText: /Walk/i }).first();
		await walkPill.click();

		// Pick 30-minute quick button
		await asCaretaker.getByRole('button', { name: '30m' }).click();

		// Fill notes
		const notesField = asCaretaker.locator('textarea[name="notes"]');
		await notesField.fill('e2e-walk-note');

		// Submit
		await asCaretaker.getByRole('button', { name: /Log/i }).click();

		// Success banner (page.log.activityLogged = "✓ Activity logged!")
		await expect(asCaretaker.getByText('✓ Activity logged!')).toBeVisible({ timeout: 10_000 });

		// The entry must appear in the "Today so far" list
		await expect(
			asCaretaker
				.locator('text=e2e-walk-note')
				.or(asCaretaker.locator('[class*="Badge"]').filter({ hasText: /walk/i }))
		).toBeVisible({ timeout: 8_000 });
	});

	test('member sees caretaker journal entry', async ({ asCaretaker, asMember }) => {
		const today = todayUTC();

		// Caretaker opens their care journal for Biscuit.
		// The care journal page is at /care/{companionId}/journal and works on today's date.
		await asCaretaker.goto(`/care/${BISCUIT}/journal`);

		// The journal textarea has name="body"; the MarkdownTextarea renders a <textarea>
		const bodyField = asCaretaker.locator('textarea[name="body"]');
		await bodyField.fill('e2e-caretaker-journal');

		// Wait for autosave ("✓ Saved" indicator — page.journal.caretaker.savedStatus)
		await expect(asCaretaker.getByText('✓ Saved')).toBeVisible({ timeout: 10_000 });

		// Member views the journal entry for the same companion + date via the app route.
		// The app [date] journal page renders the body in a raw <textarea> (no name attr)
		// in write mode. Locate by placeholder substring.
		await asMember.goto(`/${BISCUIT}/journal/${today}`);
		await expect(asMember.locator('textarea').first()).toHaveValue('e2e-caretaker-journal', {
			timeout: 10_000
		});

		// Member edits the caretaker's entry; the care journal then shows the
		// editor attribution next to the original author (#24).
		await asMember.locator('textarea').first().fill('e2e-member-edit');
		await asMember.locator('h1').first().click();
		await expect(asMember.getByText('✓ Saved')).toBeVisible({ timeout: 10_000 });

		await asCaretaker.goto(`/care/${BISCUIT}/journal`);
		await expect(asCaretaker.getByText(/edited by Seed Member/)).toBeVisible({
			timeout: 10_000
		});
	});

	test('caretaker app-route bounce', async ({ asCaretaker }) => {
		// The (app) layout load() checks role === 'caretaker' and redirects to /care.
		await asCaretaker.goto(`/${BISCUIT}/health`);

		// Must end up at /care (or a sub-path like /care/{companionId})
		await expect(asCaretaker).toHaveURL(/\/care/, { timeout: 10_000 });

		// Must NOT be on the requested app route
		await expect(asCaretaker).not.toHaveURL(new RegExp(`/${BISCUIT}/health`));
	});
});
