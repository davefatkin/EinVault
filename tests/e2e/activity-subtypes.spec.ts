import { test, expect } from '../lib/fixtures';

const EIN = 'seed-comp-ein';
const EDWARD = 'seed-comp-edward';

test.describe('activity subtypes', () => {
	test('subtype pills appear per type and log with the chosen subtype', async ({ asMember }) => {
		await asMember.goto(`/${EIN}/log?type=bathroom`);

		// Bathroom offers its three subtypes as aria-pressed pills.
		await expect(asMember.getByRole('button', { name: /Pee/ })).toBeVisible();
		await expect(asMember.getByRole('button', { name: /Poop/ })).toBeVisible();
		await expect(asMember.getByRole('button', { name: /Both/ })).toBeVisible();

		// Switching to Other (no subtypes) hides the row entirely.
		await asMember.locator('input[name="type"][value="other"]').click({ force: true });
		await expect(asMember.getByRole('button', { name: /Poop/ })).toHaveCount(0);

		// Back to bathroom, pick Poop, log it. Notes deliberately avoid the
		// subtype/type words so the row's label assertion can't collide with them.
		await asMember.locator('input[name="type"][value="bathroom"]').click({ force: true });
		const poop = asMember.getByRole('button', { name: /Poop/ });
		await poop.click();
		await expect(poop).toHaveAttribute('aria-pressed', 'true');

		await asMember.locator('textarea[name="notes"]').fill('e2e subtype selection alpha');
		await asMember.getByRole('button', { name: /^Log / }).click();
		await expect(asMember.getByText(/Activity logged/)).toBeVisible();

		// Today list shows the subtype label instead of the generic type.
		const row = asMember
			.locator('div.flex.items-center', { hasText: 'e2e subtype selection alpha' })
			.last();
		await expect(row.getByText('Poop', { exact: true })).toBeVisible();
	});

	test('subtype is optional — logging without one still works', async ({ asMember }) => {
		await asMember.goto(`/${EIN}/log?type=bathroom`);
		await asMember.locator('textarea[name="notes"]').fill('e2e optional no kind beta');
		await asMember.getByRole('button', { name: /^Log / }).click();
		await expect(asMember.getByText(/Activity logged/)).toBeVisible();

		// Untyped event falls back to the generic type label.
		const row = asMember
			.locator('div.flex.items-center', { hasText: 'e2e optional no kind beta' })
			.last();
		await expect(row.getByText('Bathroom', { exact: true })).toBeVisible();
	});

	test('journal day page adds and edits an activity subtype directly', async ({ asMember }) => {
		// Server-side "today" is UTC-derived; mirror the journal spec's computation.
		const today = (() => {
			const n = new Date();
			const p = (x: number) => String(x).padStart(2, '0');
			return `${n.getUTCFullYear()}-${p(n.getUTCMonth() + 1)}-${p(n.getUTCDate())}`;
		})();

		await asMember.goto(`/${EIN}/journal/${today}`);

		// Open the add-activity form and pick bathroom → Poop.
		await asMember.getByRole('button', { name: /log activity/i }).click();
		const addForm = asMember.locator('form[action="?/addActivity"]');
		await addForm.locator('input[name="type"][value="bathroom"]').click({ force: true });
		await addForm.getByRole('button', { name: /Poop/ }).click();
		await addForm.locator('textarea[name="notes"]').fill('e2e day-page subtype gamma');
		await addForm.getByRole('button', { name: /Log it/i }).click();

		// The new activity row renders the subtype label, not the generic type.
		const row = asMember
			.locator('div.divide-y > div')
			.filter({ hasText: 'e2e day-page subtype gamma' });
		await expect(row.getByText('Poop', { exact: true })).toBeVisible({ timeout: 8_000 });

		// Edit it to a different subtype (Both) and confirm the label changes.
		await row.getByRole('button', { name: /edit/i }).click();
		const editForm = asMember.locator('form[action="?/updateActivity"]');
		await editForm.getByRole('button', { name: /Both/ }).click();
		await editForm.getByRole('button', { name: /^Save$/ }).click();

		const editedRow = asMember
			.locator('div.divide-y > div')
			.filter({ hasText: 'e2e day-page subtype gamma' });
		await expect(editedRow.getByText('Both', { exact: true })).toBeVisible({ timeout: 8_000 });
	});

	test('quick-log button with a subtype logs it in one tap', async ({ asMember }) => {
		// Create the button in settings. The member already has seeded quick logs,
		// so the "Add quick log" trigger is the list footer button.
		await asMember.goto('/settings/quick-logs');
		await asMember
			.getByRole('button', { name: /add quick log/i })
			.first()
			.click();

		await asMember.locator('input[name="name"]').fill('e2e Pee button');
		await asMember.locator('input[name="type"][value="bathroom"]').click({ force: true });
		await asMember.getByRole('button', { name: /Pee/ }).click();

		// Scope to Ein only so the dashboard button logs directly (single target).
		// The create editor starts with every companion checked.
		const edward = asMember.locator('input[name="companionIds"][value="' + EDWARD + '"]');
		if (await edward.isChecked()) await edward.click({ force: true });

		await asMember.getByRole('button', { name: /^Save$/ }).click();
		await expect(asMember.getByText('e2e Pee button')).toBeVisible();

		// Tap it on the companion page; a single-target button logs in one tap.
		await asMember.goto(`/${EIN}`);
		await asMember.getByRole('button', { name: /e2e Pee button/ }).click();
		await expect(asMember.getByText(/Activity logged/)).toBeVisible();

		// The recent-activity timeline (still on the companion page) picks up the
		// new entry via invalidateAll and shows the subtype label, not just "Bathroom".
		await expect(asMember.getByText('Pee', { exact: true }).first()).toBeVisible();
	});
});
