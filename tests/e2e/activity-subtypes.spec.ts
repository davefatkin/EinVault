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
		const row = asMember.locator('div', { hasText: 'e2e subtype selection alpha' }).last();
		await expect(row.getByText('Poop', { exact: true })).toBeVisible();
	});

	test('subtype is optional — logging without one still works', async ({ asMember }) => {
		await asMember.goto(`/${EIN}/log?type=bathroom`);
		await asMember.locator('textarea[name="notes"]').fill('e2e optional no kind beta');
		await asMember.getByRole('button', { name: /^Log / }).click();
		await expect(asMember.getByText(/Activity logged/)).toBeVisible();

		// Untyped event falls back to the generic type label.
		const row = asMember.locator('div', { hasText: 'e2e optional no kind beta' }).last();
		await expect(row.getByText('Bathroom', { exact: true })).toBeVisible();
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
	});
});
