import { expect, type Page } from '@playwright/test';
import { waitForHydration } from './hydration';

// Incidents created by a spec must not outlive it: an open incident on a seeded
// companion puts a banner on every other spec's dashboard in the same worker.
// Create through createIncidentViaUi and delete in a `finally` through
// deleteIncidentViaUi.

export async function createIncidentViaUi(
	page: Page,
	companionId: string,
	{ title, severity }: { title: string; severity?: 'mild' | 'moderate' | 'severe' }
): Promise<string> {
	await page.goto(`/${companionId}/health/incidents/new`);
	await waitForHydration(page);
	await page.locator('#incident-title').fill(title);
	if (severity) await page.locator('#incident-severity').selectOption(severity);
	await page.getByRole('button', { name: 'Save incident' }).click();
	await expect(page).toHaveURL(new RegExp(`/${companionId}/health/incidents/(?!new$)[^/?#]+$`), {
		timeout: 10_000
	});
	const id = new URL(page.url()).pathname.split('/').pop();
	if (!id) throw new Error(`no incident id in ${page.url()}`);
	return id;
}

export async function deleteIncidentViaUi(
	page: Page,
	companionId: string,
	id: string
): Promise<void> {
	await page.goto(`/${companionId}/health/incidents/${id}`);
	await waitForHydration(page);
	await page.getByTestId('incident-delete').click();
	await page.getByRole('dialog').getByRole('button', { name: 'Delete', exact: true }).click();
	await expect(page).toHaveURL(new RegExp(`/${companionId}/health$`), { timeout: 10_000 });
}
