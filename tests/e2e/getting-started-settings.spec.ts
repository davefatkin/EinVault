import { test, expect, setupAdminAndLogIn } from '../lib/pristine';
import { waitForHydration } from '../lib/hydration';

test('getting started row restores the card', async ({ pristine, page }) => {
	await setupAdminAndLogIn(page, pristine);
	await page.goto(pristine.baseURL + '/settings');
	await waitForHydration(page);

	const row = page.locator('[data-testid="getting-started-row"]');
	await expect(row.getByText('Getting started card')).toBeVisible();
	await expect(row.getByText('Showing', { exact: true })).toBeVisible();
	await expect(row.getByRole('button', { name: 'Show it again' })).toHaveCount(0);

	// Task 4's X button posts here from another page via use:enhance; a plain
	// action request stands in for it.
	const res = await page.request.post(pristine.baseURL + '/settings?/gettingStartedHide', {
		headers: { 'x-sveltekit-action': 'true', origin: pristine.baseURL },
		form: {}
	});
	expect(res.ok()).toBe(true);
	await page.reload();
	await waitForHydration(page);
	await expect(row.getByText('Hidden. 0 of 4 steps done.')).toBeVisible();

	await row.getByRole('button', { name: 'Show it again' }).click();
	await expect(row.getByText('Showing', { exact: true })).toBeVisible();
	await expect(row.getByRole('button', { name: 'Show it again' })).toHaveCount(0);
});
