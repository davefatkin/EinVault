import Database from 'better-sqlite3';
import path from 'node:path';
import type { Page } from '@playwright/test';
import { test, expect, type AppWorker } from '../lib/fixtures';
import { SEED } from '../lib/seed';
import { pngUpload } from '../lib/files';
import { waitForHydration } from '../lib/hydration';

const EIN = SEED.companions.ein.id;
const EDWARD = SEED.companions.edward.id;
const BASE = `/${EIN}/supplies`;

/** Remove what a test created even when it failed halfway, receipts included. */
function cleanup(app: AppWorker, name: string) {
	const sqlite = new Database(path.join(app.dataDir, 'einvault.db'));
	try {
		sqlite.pragma('foreign_keys = ON');
		sqlite.prepare('DELETE FROM supplies WHERE name = ?').run(name);
		sqlite.prepare('DELETE FROM documents WHERE title = ?').run(`Receipt: ${name}`);
	} finally {
		sqlite.close();
	}
}

/** Opens the add form from the list and fills what both kinds share. */
async function startSupply(page: Page, name: string) {
	await page.goto(BASE);
	await waitForHydration(page);
	await page.getByRole('link', { name: 'Add supply' }).first().click();
	await expect(page).toHaveURL(new RegExp(`${BASE}/new$`));
	await waitForHydration(page);
	await page.locator('#supply-name').fill(name);
}

async function save(page: Page) {
	await page.getByRole('button', { name: 'Save supply' }).click();
	await expect(page).toHaveURL(new RegExp(`/supplies/(?!new$)[^/]+$`), { timeout: 8_000 });
	await waitForHydration(page);
}

test.describe('supplies (owner)', () => {
	test('count, buy with a receipt, correct and delete a supply', async ({ asMember, app }) => {
		const name = `Test tablets ${Date.now()}`;
		try {
			await startSupply(asMember, name);
			await asMember.locator('#supply-unit').fill('tablets');
			await asMember.locator('#supply-startingQuantity').fill('30');
			await save(asMember);
			const detailUrl = asMember.url();
			await expect(asMember.getByRole('heading', { name, level: 1 })).toBeVisible();

			await asMember.goto(BASE);
			const row = asMember.getByRole('listitem').filter({ hasText: name });
			await expect(row.getByText('30 tablets left')).toBeVisible();

			// A purchase with a cost and a receipt adds to the count.
			await asMember.goto(detailUrl);
			await waitForHydration(asMember);
			await asMember.getByRole('button', { name: 'Log purchase' }).click();
			const dialog = asMember.getByRole('dialog');
			await dialog.locator('#purchase-quantity').fill('10');
			await dialog.locator('#purchase-cost').fill('12.50');
			await dialog.locator('#purchase-receipt').setInputFiles(pngUpload('receipt.png'));
			await dialog.getByRole('button', { name: 'Save purchase' }).click();
			await expect(dialog).toHaveCount(0, { timeout: 8_000 });
			await expect(asMember.getByText('40 tablets left').first()).toBeVisible();

			const history = asMember.getByRole('region', { name: 'History' });
			const bought = history.getByRole('listitem').filter({ hasText: '$12.50' });
			await expect(bought).toHaveCount(1);
			const receipt = bought.getByRole('link', { name: 'Receipt' });
			const href = await receipt.getAttribute('href');
			expect(href).toMatch(new RegExp(`^/api/documents/${EIN}/`));
			const res = await asMember.request.get(href!);
			expect(res.status()).toBe(200);
			expect(res.headers()['content-type']).toContain('image/png');

			await asMember.goto(`/${EIN}/documents`);
			await expect(asMember.getByText(`Receipt: ${name}`)).toBeVisible();

			// Correct count writes a correction to the history.
			await asMember.goto(detailUrl);
			await waitForHydration(asMember);
			await asMember.getByRole('button', { name: 'Correct count' }).click();
			const correct = asMember.getByRole('dialog');
			await correct.locator('#correct-actual').fill('35');
			await correct.getByRole('button', { name: 'Save count' }).click();
			await expect(correct).toHaveCount(0, { timeout: 8_000 });
			await expect(asMember.getByText('35 tablets left').first()).toBeVisible();
			await expect(history.getByText('Count corrected')).toBeVisible();

			// Deleting the purchase takes its 10 back off; the receipt stays.
			await history
				.getByRole('listitem')
				.filter({ hasText: '$12.50' })
				.getByRole('button', { name: 'Delete from history' })
				.click();
			await asMember.getByRole('dialog').getByRole('button', { name: 'Delete' }).click();
			await expect(asMember.getByText('25 tablets left').first()).toBeVisible({ timeout: 8_000 });
			await expect(history.getByText('$12.50')).toHaveCount(0);
			await asMember.goto(`/${EIN}/documents`);
			await expect(asMember.getByText(`Receipt: ${name}`)).toBeVisible();

			// Delete asks first, then returns to the list.
			await asMember.goto(detailUrl);
			await waitForHydration(asMember);
			await asMember.getByRole('button', { name: 'Delete', exact: true }).click();
			const confirm = asMember.getByRole('dialog');
			await expect(confirm).toContainText(name);
			await confirm.getByRole('button', { name: 'Delete' }).click();
			await expect(asMember).toHaveURL(new RegExp(`${BASE}$`), { timeout: 8_000 });
			await expect(asMember.getByText(name)).toHaveCount(0);
		} finally {
			cleanup(app, name);
		}
	});

	test('a supply that lasts about 30 days from today', async ({ asMember, app }) => {
		const name = `e2e-food-${Date.now()}`;
		try {
			await startSupply(asMember, name);
			await asMember.locator('#supply-kind-duration').check();
			await asMember.locator('#supply-lastsDays').fill('30');
			// Today as the server sees it: the field's max.
			const first = asMember.locator('#supply-firstPurchaseDate');
			await first.fill((await first.getAttribute('max'))!);
			await save(asMember);
			await expect(asMember.getByText('about 4 weeks left').first()).toBeVisible();

			await asMember.goto(BASE);
			const row = asMember.getByRole('listitem').filter({ hasText: name });
			await expect(row.getByText('about 4 weeks left')).toBeVisible();
		} finally {
			cleanup(app, name);
		}
	});

	test('a shared supply shows on both pets', async ({ asMember, app }) => {
		const name = `e2e-shared-${Date.now()}`;
		try {
			await startSupply(asMember, name);
			await asMember.getByRole('checkbox', { name: 'Edward' }).check();
			await asMember.locator('#supply-startingQuantity').fill('5');
			await save(asMember);

			await asMember.goto(`/${EDWARD}/supplies`);
			const row = asMember.getByRole('listitem').filter({ hasText: name });
			await expect(row.getByText('Shared with Ein')).toBeVisible();
			await asMember.goto(BASE);
			await expect(
				asMember.getByRole('listitem').filter({ hasText: name }).getByText('Shared with Edward')
			).toBeVisible();

			// Editing from Edward's page and unchecking Edward lands under Ein.
			await asMember.goto(`/${EDWARD}/supplies`);
			await asMember.getByRole('link', { name }).click();
			await waitForHydration(asMember);
			await asMember.getByRole('link', { name: 'Edit', exact: true }).click();
			await expect(asMember).toHaveURL(/\/edit$/);
			await waitForHydration(asMember);
			await expect(asMember.locator('#supply-name')).toHaveValue(name);
			await asMember.getByRole('checkbox', { name: 'Edward' }).uncheck();
			await asMember.getByRole('button', { name: 'Save supply' }).click();
			await expect(asMember).toHaveURL(new RegExp(`${BASE}/[^/]+$`), { timeout: 8_000 });
			await asMember.goto(`/${EDWARD}/supplies`);
			await expect(asMember.getByText(name)).toHaveCount(0);
		} finally {
			cleanup(app, name);
		}
	});

	test('sidebar links to Supplies', async ({ asMember }, testInfo) => {
		test.skip(testInfo.project.name === 'mobile', 'the sidebar is desktop-only');
		await asMember.goto(`/${EIN}`);
		await asMember.getByRole('link', { name: 'Supplies', exact: true }).click();
		await expect(asMember).toHaveURL(new RegExp(`${BASE}$`));
		await expect(asMember.getByRole('heading', { name: 'Supplies', level: 1 })).toBeVisible();
	});
});

test('caretakers cannot reach supplies', async ({ asCaretaker }) => {
	await asCaretaker.goto(BASE);
	await expect(asCaretaker).toHaveURL(/\/care(\/|$)/);
	await expect(asCaretaker).not.toHaveURL(/supplies/);
});
