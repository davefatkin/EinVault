import { test, expect } from '../lib/fixtures';

const EIN = 'seed-comp-ein';
const EDWARD = 'seed-comp-edward';

test.describe('custom quick logs', () => {
	test('member creates, executes, reorders, disables, and shares a quick log', async ({
		asMember,
		asAdmin
	}) => {
		// Create via settings sub-page, assigned to both companions.
		await asMember.goto('/settings/quick-logs');
		await asMember.getByRole('button', { name: 'Add quick log' }).click();
		await asMember.locator('input[name="name"]').fill('Evening walk');
		await asMember.locator('label').filter({ hasText: /Walk/i }).first().click();
		// Both companions are pre-checked on create; add a note.
		await asMember.locator('textarea[name="note"]').fill('around the block');
		await asMember.getByRole('button', { name: 'Save', exact: true }).click();
		await expect(asMember.getByText('Evening walk')).toBeVisible();

		// The button shows on the companion detail page and executes with remember.
		await asMember.goto(`/${EIN}`);
		const pill = asMember.getByRole('button', { name: /Evening walk/ });
		await expect(pill).toBeVisible();
		await pill.click();
		// Panel opens with target pills; log it.
		await asMember.getByRole('button', { name: /Log Evening walk/ }).click();
		await expect(asMember.getByText(/Activity logged/)).toBeVisible();

		// The event landed with the preset note.
		await asMember.goto(`/${EIN}/log`);
		await expect(asMember.getByText('around the block').first()).toBeVisible();

		// Dashboard also shows the button (2+ companions → no redirect).
		await asMember.goto('/');
		await expect(asMember.getByRole('button', { name: /Evening walk/ })).toBeVisible();

		// Create a second one to exercise reordering.
		await asMember.goto('/settings/quick-logs');
		await asMember.getByRole('button', { name: 'Add quick log' }).click();
		await asMember.locator('input[name="name"]').fill('Breakfast');
		await asMember.locator('label').filter({ hasText: /Meal/i }).first().click();
		await asMember.getByRole('button', { name: 'Save', exact: true }).click();
		await expect(asMember.getByText('Breakfast')).toBeVisible();

		// Move "Breakfast" up so it precedes "Evening walk". Assert relative order
		// by row position (not absolute index) so unrelated quick logs the member
		// may already own don't matter.
		const walkRow = asMember.locator('div.divide-y > div').filter({ hasText: 'Evening walk' });
		const breakfastRow = asMember.locator('div.divide-y > div').filter({ hasText: 'Breakfast' });
		const rowY = async (l: typeof walkRow) => (await l.boundingBox())!.y;
		expect(await rowY(walkRow)).toBeLessThan(await rowY(breakfastRow));
		await breakfastRow.getByRole('button', { name: 'Move up' }).click();
		await expect(async () => {
			expect(await rowY(breakfastRow)).toBeLessThan(await rowY(walkRow));
		}).toPass();

		// Disable "Breakfast"; its button disappears from the dashboard.
		await breakfastRow.getByRole('button', { name: 'Disable' }).click();
		await expect(breakfastRow.getByText('Disabled')).toBeVisible();
		await asMember.goto('/');
		await expect(asMember.getByRole('button', { name: /Breakfast/ })).toHaveCount(0);
		await expect(asMember.getByRole('button', { name: /Evening walk/ })).toBeVisible();

		// Share "Evening walk" with the admin; copy semantics.
		await asMember.goto('/settings/quick-logs');
		await asMember
			.locator('div.divide-y > div')
			.filter({ hasText: 'Evening walk' })
			.getByRole('button', { name: 'Share', exact: true })
			.click();
		await asMember.locator('label').filter({ hasText: 'Spike' }).first().click();
		await asMember.getByRole('button', { name: 'Share copy' }).click();
		await expect(asMember.getByText(/Copied to 1 user/)).toBeVisible();

		// Admin sees an independent copy in their own list.
		await asAdmin.goto('/settings/quick-logs');
		await expect(asAdmin.getByText('Evening walk')).toBeVisible();

		// Member renames the original; admin's copy is untouched.
		await asMember
			.locator('div.divide-y > div')
			.filter({ hasText: 'Evening walk' })
			.getByRole('button', { name: 'Edit' })
			.click();
		await asMember.locator('input[name="name"]').fill('Evening walk v2');
		await asMember.getByRole('button', { name: 'Save', exact: true }).click();
		await expect(asMember.getByText('Evening walk v2')).toBeVisible();

		await asAdmin.reload();
		await expect(asAdmin.getByText('Evening walk v2')).toHaveCount(0);
		await expect(asAdmin.getByText('Evening walk')).toBeVisible();
	});

	test('caretaker manages quick logs scoped to assigned companions', async ({ asCaretaker }) => {
		await asCaretaker.goto('/care/settings/quick-logs');
		await asCaretaker.getByRole('button', { name: 'Add quick log' }).click();

		// Companion picker only offers the assigned companion (Ein), not Edward.
		await expect(asCaretaker.locator(`input[name="companionIds"][value="${EIN}"]`)).toHaveCount(1);
		await expect(asCaretaker.locator(`input[name="companionIds"][value="${EDWARD}"]`)).toHaveCount(
			0
		);

		await asCaretaker.locator('input[name="name"]').fill('Care walk');
		await asCaretaker.getByRole('button', { name: 'Save', exact: true }).click();
		await expect(asCaretaker.getByText('Care walk')).toBeVisible();

		// The button renders on the care page (seeded caretaker is on shift) and executes.
		await asCaretaker.goto(`/care/${EIN}`);
		await asCaretaker.getByRole('button', { name: /Care walk/ }).click();
		await asCaretaker.getByRole('button', { name: /Log Care walk/ }).click();
		await expect(asCaretaker.getByText(/Activity logged/)).toBeVisible();
	});
});
