import type { Page } from '@playwright/test';

/**
 * Wait until the root layout has hydrated (it sets `data-hydrated` on <html>
 * in onMount). Call this after goto/reload and before typing into autosave
 * fields or picking upload files. Those rely on client handlers that are not
 * attached before hydration, and page state is then reinitialized from load
 * data, so a value filled earlier is lost and never saved.
 */
export async function waitForHydration(page: Page, timeout = 15_000): Promise<void> {
	await page.locator('html[data-hydrated]').waitFor({ state: 'attached', timeout });
}
