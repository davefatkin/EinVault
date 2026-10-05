import { expect, type Page } from '@playwright/test';

// Creates a token via the settings UI and returns the raw value. Svelte sets
// input values as DOM properties (not attributes), so read via evaluate after
// the reveal-once alert renders.
export async function createToken(
	page: Page,
	name: string,
	settingsPath = '/settings',
	scope: 'full' | 'write' = 'full'
): Promise<string> {
	await page.goto(settingsPath);
	await page.getByPlaceholder('e.g. Door button').fill(name);
	if (scope === 'write') await page.locator('#api-token-scope').selectOption('write');
	await page.getByRole('button', { name: 'Create token' }).click();
	await expect(page.getByText(/Copy this token now/)).toBeVisible({ timeout: 8_000 });
	const raw = await page.evaluate(() => {
		const els = Array.from(document.querySelectorAll<HTMLInputElement>('input[readonly]'));
		return els.find((el) => el.value.startsWith('evk_'))?.value ?? '';
	});
	expect(raw.startsWith('evk_')).toBe(true);
	return raw;
}
