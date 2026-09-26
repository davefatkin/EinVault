import { test, expect } from '../lib/fixtures';

const EIN = 'seed-comp-ein';
const EDWARD = 'seed-comp-edward';
const JULIA = 'seed-comp-julia';

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

		// Scope to the daily log form: single-target custom quick log pills carry
		// hidden companionIds inputs of their own elsewhere on the dashboard.
		const dailyForm = asMember.locator('form', { has: asMember.locator('textarea[name="notes"]') });
		await dailyForm.locator(`input[name="companionIds"][value="${EIN}"]`).click({ force: true });
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

test.describe('species-aware logging', () => {
	test('cat log page offers the litter box with its subtypes, not bathroom', async ({
		asMember
	}) => {
		await asMember.goto(`/${JULIA}/log`);
		await expect(asMember.locator('input[name="type"][value="litter"]')).toHaveCount(1);
		await expect(asMember.locator('input[name="type"][value="bathroom"]')).toHaveCount(0);

		const pills = asMember.locator('fieldset', { hasText: 'Which kind?' });
		// Retry the pick: a click before hydration doesn't reach the bound state.
		await expect(async () => {
			await asMember.getByRole('radio', { name: /Litter box/ }).check({ force: true });
			await expect(pills.getByRole('button', { name: /Scooped/ })).toBeVisible({ timeout: 1_000 });
		}).toPass();
		for (const name of ['Pee', 'Poop', 'Scooped', 'Litter changed']) {
			await expect(pills.getByRole('button', { name: new RegExp(name) })).toBeVisible();
		}
	});

	test('a type the species cannot take falls back to the species default', async ({ asMember }) => {
		await asMember.goto(`/${JULIA}/log?type=bathroom`);
		await expect(asMember.locator('input[name="type"][value="walk"]')).toBeChecked();
	});

	test('cat companion page offers the cat quick trio', async ({ asMember }) => {
		await asMember.goto(`/${JULIA}`);
		const section = asMember.locator('section', { hasText: 'Quick log' }).first();
		for (const type of ['meal', 'litter', 'play']) {
			await expect(section.locator(`a[href="/${JULIA}/log?type=${type}"]`)).toBeVisible();
		}
		await expect(section.locator(`a[href="/${JULIA}/log?type=bathroom"]`)).toHaveCount(0);
		await expect(section.locator(`a[href="/${JULIA}/log?type=walk"]`)).toHaveCount(0);
	});

	test('also-log-for only lists companions that can take the selected type', async ({
		asMember
	}) => {
		await asMember.goto(`/${EIN}/log?type=walk`);
		const julia = asMember.locator(`input[name="additionalCompanionIds"][value="${JULIA}"]`);
		await expect(julia).toHaveCount(1);

		await expect(async () => {
			await asMember.getByRole('radio', { name: /Bathroom/ }).check({ force: true });
			await expect(julia).toHaveCount(0, { timeout: 1_000 });
		}).toPass();
		await expect(
			asMember.locator(`input[name="additionalCompanionIds"][value="${EDWARD}"]`)
		).toHaveCount(1);
	});

	test('switching companions in-app swaps the quick trio without a reload', async ({
		asMember
	}) => {
		await asMember.goto(`/${EIN}`);
		const section = asMember.locator('section', { hasText: 'Quick log' }).first();
		await expect(section.locator(`a[href="/${EIN}/log?type=bathroom"]`)).toBeVisible();

		// A full page load would drop this marker.
		await asMember.evaluate(
			() => ((window as unknown as { __noReload: boolean }).__noReload = true)
		);

		const listbox = asMember.getByRole('listbox', { name: 'Switch companion' });
		await expect(async () => {
			if (!(await listbox.isVisible()))
				await asMember
					.getByRole('button', { name: 'Switch companion' })
					.filter({ visible: true })
					.click();
			await expect(listbox).toBeVisible({ timeout: 1_000 });
		}).toPass();
		await listbox.getByRole('button', { name: /Julia/ }).click();
		await expect(asMember).toHaveURL(new RegExp(`/${JULIA}$`));

		await expect(section.locator(`a[href="/${JULIA}/log?type=litter"]`)).toBeVisible();
		await expect(section.getByRole('link', { name: /Litter box/ })).toBeVisible();
		await expect(section.getByRole('link', { name: /Bathroom/ })).toHaveCount(0);
		expect(
			await asMember.evaluate(() => (window as unknown as { __noReload?: boolean }).__noReload)
		).toBe(true);
	});
});
