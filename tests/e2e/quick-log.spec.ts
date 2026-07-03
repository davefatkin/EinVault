import { test, expect } from '../lib/fixtures';

const EIN = 'seed-comp-ein';
const EDWARD = 'seed-comp-edward';

test.describe('member quick log', () => {
	test('companion page tiles lead to the log form and log an activity', async ({ asMember }) => {
		await asMember.goto(`/${EIN}`);

		// Quick log tile row is visible on the companion detail page
		const section = asMember.locator('section', { hasText: 'Quick log' }).first();
		await expect(section.getByRole('link', { name: /Walk/ })).toBeVisible();

		await section.getByRole('link', { name: /Walk/ }).click();
		await expect(asMember).toHaveURL(new RegExp(`/${EIN}/log\\?type=walk`));

		// Walk is preselected via the query param
		await expect(asMember.locator('input[name="type"][value="walk"]')).toBeChecked();

		await asMember.locator('textarea[name="notes"]').fill('e2e member walk');
		await asMember.getByRole('button', { name: /^Log / }).click();

		await expect(asMember.getByText(/Activity logged/)).toBeVisible();
		await expect(asMember.getByText('e2e member walk')).toBeVisible();
	});

	test('also-log-for creates entries for both companions', async ({ asMember }) => {
		await asMember.goto(`/${EIN}/log?type=meal`);

		// Check Edward as an additional target
		await asMember.locator(`input[name="additionalCompanionIds"][value="${EDWARD}"]`).click({
			force: true
		});
		await asMember.locator('textarea[name="notes"]').fill('e2e shared meal');
		await asMember.getByRole('button', { name: /^Log / }).click();
		await expect(asMember.getByText(/Activity logged/)).toBeVisible();

		// Both companions show the entry in "Today so far"
		await expect(asMember.getByText('e2e shared meal')).toBeVisible();
		await asMember.goto(`/${EDWARD}/log`);
		await expect(asMember.getByText('e2e shared meal')).toBeVisible();
	});

	test('dashboard quick log logs for selected companions', async ({ asMember }) => {
		await asMember.goto('/');

		// Expand the collapsed quick log card
		await asMember.getByText('Quick log', { exact: true }).click();

		// Free mode requires picking companions; button disabled until one is picked
		const submit = asMember.getByRole('button', { name: /^Log / });
		await expect(submit).toBeDisabled();

		await asMember.locator(`input[name="companionIds"][value="${EIN}"]`).click({ force: true });
		await asMember.locator('textarea[name="notes"]').fill('e2e dashboard treat');
		await asMember.locator('input[name="type"][value="treat"]').click({ force: true });
		await submit.click();

		await expect(asMember.getByText(/Activity logged/)).toBeVisible();
		await asMember.goto(`/${EIN}/log`);
		await expect(asMember.getByText('e2e dashboard treat')).toBeVisible();
	});

	test('member can delete their own entry', async ({ asMember }) => {
		await asMember.goto(`/${EIN}/log?type=bathroom`);
		await asMember.locator('textarea[name="notes"]').fill('e2e delete me');
		await asMember.getByRole('button', { name: /^Log / }).click();
		await expect(asMember.getByText('e2e delete me')).toBeVisible();

		const row = asMember
			.locator('div.flex.items-center', { hasText: 'e2e delete me' })
			.filter({ has: asMember.getByRole('button', { name: 'Delete entry' }) })
			.first();
		await row.getByRole('button', { name: 'Delete entry' }).click();
		await expect(asMember.getByText('e2e delete me')).toHaveCount(0);
	});
});

test.describe('caretaker quick log still works', () => {
	test('caretaker on shift logs from the shared form', async ({ asCaretaker }) => {
		await asCaretaker.goto(`/care/${EIN}/log?type=walk`);
		await expect(asCaretaker.locator('input[name="type"][value="walk"]')).toBeChecked();

		await asCaretaker.locator('textarea[name="notes"]').fill('e2e caretaker walk');
		await asCaretaker.getByRole('button', { name: /^Log / }).click();

		await expect(asCaretaker.getByText(/Activity logged/)).toBeVisible();
		await expect(asCaretaker.getByText('e2e caretaker walk')).toBeVisible();
	});
});
