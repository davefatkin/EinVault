import { expect, type Page } from '@playwright/test';
import { waitForHydration } from './hydration';

/** The More tab in the phone bottom bar, once the page can react to taps. */
export async function moreButton(page: Page) {
	await waitForHydration(page);
	const more = page
		.getByRole('navigation', { name: 'Main navigation' })
		.getByRole('button', { name: /^More/ });
	await expect(more).toBeVisible({ timeout: 8_000 });
	return more;
}

/** Open the More sheet and follow one of its rows. */
export async function goViaMore(page: Page, row: string) {
	await (await moreButton(page)).click();
	const dialog = page.getByRole('dialog', { name: 'More sections' });
	await dialog.getByRole('link', { name: row }).click();
}
