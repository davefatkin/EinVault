import { expect, type Page, type Response } from '@playwright/test';
import { waitForHydration } from './hydration';

// Incidents created by a spec must not outlive it: an open incident on a seeded
// companion puts a banner on every other spec's dashboard in the same worker.
// Create through createIncidentViaUi and delete in a `finally` through
// deleteIncidentViaUi.

/**
 * Resolves with the id an enhanced create action (`?/create`, `?/addIncident`)
 * returns. Set it up before the click. The id comes from the action response,
 * not the URL, so a spec has it for cleanup even when the navigation after
 * saving never happens.
 */
export function waitForCreatedIncidentId(page: Page, action: string): Promise<string> {
	return page
		.waitForResponse((r) => r.request().method() === 'POST' && r.url().endsWith(`?/${action}`), {
			timeout: 15_000
		})
		.then(actionResultId);
}

// An enhanced action answers with { type, status, data }, where data is a
// devalue string: a flat array whose first element maps keys to indexes.
async function actionResultId(response: Response): Promise<string> {
	const body = (await response.json()) as { type: string; data?: string };
	if (body.type !== 'success' || !body.data) {
		throw new Error(`create action failed: ${JSON.stringify(body)}`);
	}
	const flat = JSON.parse(body.data) as unknown[];
	const root = flat[0] as Record<string, number>;
	const id = flat[root.id];
	if (typeof id !== 'string') throw new Error(`no id in action result ${body.data}`);
	return id;
}

export async function createIncidentViaUi(
	page: Page,
	companionId: string,
	{ title, severity }: { title: string; severity?: 'mild' | 'moderate' | 'severe' }
): Promise<string> {
	await page.goto(`/${companionId}/health/incidents/new`);
	await waitForHydration(page);
	await page.locator('#incident-title').fill(title);
	if (severity) await page.locator('#incident-severity').selectOption(severity);
	const created = waitForCreatedIncidentId(page, 'create');
	await page.getByRole('button', { name: 'Save incident' }).click();
	const id = await created;
	try {
		await expect(page).toHaveURL(incidentUrl(companionId, id), { timeout: 10_000 });
	} catch (err) {
		// The caller never gets the id, so clean up here.
		await deleteIncidentViaUi(page, companionId, id).catch(() => {});
		throw err;
	}
	return id;
}

export function incidentUrl(companionId: string, id: string): RegExp {
	return new RegExp(`/${companionId}/health/incidents/${id}$`);
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
