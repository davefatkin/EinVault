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
		sqlite.prepare('DELETE FROM medications WHERE name = ?').run(`${name} med`);
		sqlite.prepare('DELETE FROM supplies WHERE name = ?').run(name);
		sqlite.prepare('DELETE FROM documents WHERE title = ?').run(`Receipt: ${name}`);
	} finally {
		sqlite.close();
	}
}

/** Puts the household currency back to USD straight in the worker's DB. */
function resetCurrency(app: AppWorker) {
	const sqlite = new Database(path.join(app.dataDir, 'einvault.db'));
	try {
		sqlite.prepare("UPDATE app_settings SET currency = 'USD'").run();
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

/** Adds a counted supply of `quantity` tablets (optionally warning at `lowAt`) and returns its URL. */
async function addCountedSupply(page: Page, name: string, quantity: number, lowAt?: number) {
	await startSupply(page, name);
	await page.locator('#supply-unit').fill('tablets');
	await page.locator('#supply-startingQuantity').fill(String(quantity));
	if (lowAt !== undefined) await page.locator('#supply-lowStockAt').fill(String(lowAt));
	await save(page);
	return page.url();
}

test.describe('medications and supplies', () => {
	test('doses subtract from a linked supply, for members and caretakers', async ({
		asMember,
		asCaretaker,
		app
	}) => {
		const name = `e2e-linked-${Date.now()}`;
		const medName = `${name} med`;
		try {
			await addCountedSupply(asMember, name, 10);

			await asMember.goto(`/${EIN}/medications`);
			await waitForHydration(asMember);
			await asMember.getByRole('button', { name: 'Add medication' }).first().click();
			await asMember.getByLabel('Name').fill(medName);
			// Units per dose shows only once a supply is chosen.
			await expect(asMember.locator('#med-doseUnits')).toHaveCount(0);
			await asMember.locator('#med-supplyId').selectOption({ label: name });
			await expect(asMember.locator('#med-doseUnits')).toHaveValue('1');
			await expect(asMember.getByRole('link', { name: 'New supply' })).toHaveAttribute(
				'href',
				`${BASE}/new`
			);
			await asMember.getByRole('button', { name: 'Save medication' }).click();
			await expect(asMember.getByRole('button', { name: 'Save medication' })).toHaveCount(0, {
				timeout: 8_000
			});

			await asMember.getByRole('link', { name: medName }).click();
			await expect(asMember).toHaveURL(new RegExp(`/${EIN}/medications/[^/?]+$`));
			const detailUrl = asMember.url();
			await waitForHydration(asMember);
			const stock = asMember.getByTestId('medication-stock');
			await expect(stock).toContainText('10 tablets left');

			// Given takes one; removing that dose gives it back.
			await asMember.getByRole('button', { name: 'Given' }).click();
			await expect(stock).toContainText('9 tablets left', { timeout: 8_000 });
			await asMember
				.getByRole('region', { name: 'Dose history' })
				.getByRole('button', { name: 'Remove this dose' })
				.click();
			await asMember
				.getByRole('dialog')
				.getByRole('button', { name: 'Remove', exact: true })
				.click();
			await expect(stock).toContainText('10 tablets left', { timeout: 8_000 });

			// A caretaker on shift taps Given: it subtracts, and they see no supply.
			await asCaretaker.goto(`/care/${EIN}`);
			await waitForHydration(asCaretaker);
			const card = asCaretaker.getByTestId('care-medications');
			const row = card.getByRole('listitem').filter({ hasText: medName });
			await expect(row).toBeVisible({ timeout: 8_000 });
			await expect(row.getByTestId('medication-stock')).toHaveCount(0);
			await expect(row).not.toContainText('tablets');
			await row.getByRole('button', { name: 'Given' }).click();
			await expect(asCaretaker.getByText(/Dose of .* logged/).first()).toBeVisible({
				timeout: 8_000
			});

			await asMember.goto(detailUrl);
			await waitForHydration(asMember);
			await expect(asMember.getByTestId('medication-stock')).toContainText('9 tablets left');

			// Edit keeps the link and units.
			await asMember.getByRole('link', { name: 'Edit', exact: true }).first().click();
			await waitForHydration(asMember);
			await expect(asMember.locator('#med-supplyId')).toHaveValue(/.+/);
			await expect(asMember.locator('#med-doseUnits')).toHaveValue('1');
			await asMember.locator('#med-doseUnits').fill('0.5');
			await asMember.getByRole('button', { name: 'Save medication' }).click();
			await expect(asMember).toHaveURL(detailUrl, { timeout: 8_000 });
			// The caretaker's dose covers today, so this one asks first.
			await asMember.getByRole('button', { name: /^Given/ }).click();
			await asMember.getByRole('dialog').getByRole('button', { name: 'Log another dose' }).click();
			await expect(asMember.getByTestId('medication-stock')).toContainText('8.5 tablets left', {
				timeout: 8_000
			});
		} finally {
			cleanup(app, name);
		}
	});

	test('the dashboard shows a Supplies card only for supplies that need attention', async ({
		asMember,
		app
	}) => {
		const name = `e2e-dash-${Date.now()}`;
		try {
			await addCountedSupply(asMember, name, 30);
			await asMember.goto(`/${EIN}`);
			await waitForHydration(asMember);
			await expect(asMember.getByTestId('dashboard-supplies')).toHaveCount(0);

			// Down to its low-stock count: the card appears with the row.
			await asMember.goto(BASE);
			await asMember.getByRole('link', { name }).click();
			await waitForHydration(asMember);
			await asMember.getByRole('link', { name: 'Edit', exact: true }).click();
			await waitForHydration(asMember);
			await asMember.locator('#supply-lowStockAt').fill('30');
			await asMember.getByRole('button', { name: 'Save supply' }).click();
			await expect(asMember).toHaveURL(new RegExp(`${BASE}/(?!new$)[^/]+$`), { timeout: 8_000 });

			await asMember.goto(`/${EIN}`);
			const card = asMember.getByTestId('dashboard-supplies');
			await expect(card).toBeVisible();
			await expect(card.getByRole('link', { name })).toBeVisible();
			await expect(card.getByText('Running low')).toBeVisible();
			await expect(card.getByText('30 tablets left')).toBeVisible();
			await card.getByRole('link', { name: 'View All' }).click();
			await expect(asMember).toHaveURL(new RegExp(`${BASE}$`));
		} finally {
			cleanup(app, name);
		}
	});
});

test('the admin currency setting changes what new purchases show', async ({
	asAdmin,
	asMember,
	app
}) => {
	const name = `e2e-currency-${Date.now()}`;
	const setCurrency = async (code: string) => {
		await asAdmin.goto('/admin/users');
		await waitForHydration(asAdmin);
		await asAdmin.locator('select#currency').selectOption(code);
		await expect(asAdmin.getByText('Saved')).toBeVisible({ timeout: 8_000 });
	};
	try {
		await setCurrency('EUR');
		await asAdmin.reload();
		await expect(asAdmin.locator('select#currency')).toHaveValue('EUR');

		const detailUrl = await addCountedSupply(asMember, name, 5);
		await asMember.goto(detailUrl);
		await waitForHydration(asMember);
		await asMember.getByRole('button', { name: 'Log purchase' }).click();
		const dialog = asMember.getByRole('dialog');
		await dialog.locator('#purchase-quantity').fill('1');
		await dialog.locator('#purchase-cost').fill('7.50');
		await dialog.getByRole('button', { name: 'Save purchase' }).click();
		await expect(dialog).toHaveCount(0, { timeout: 8_000 });
		const history = asMember.getByRole('region', { name: 'History' });
		await expect(history.getByText('€7.50')).toBeVisible();
	} finally {
		cleanup(app, name);
		// The admin session and DB are shared per worker; other specs assert "$".
		// The UI resets the server's settings cache; if the page is what broke,
		// write the DB instead so this never hides the real failure.
		await setCurrency('USD').catch(() => resetCurrency(app));
	}
});

test('caretakers cannot reach supplies', async ({ asCaretaker }) => {
	await asCaretaker.goto(BASE);
	await expect(asCaretaker).toHaveURL(/\/care(\/|$)/);
	await expect(asCaretaker).not.toHaveURL(/supplies/);
});
