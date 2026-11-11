import Database from 'better-sqlite3';
import path from 'node:path';
import type { Page } from '@playwright/test';
import { test, expect, type AppWorker } from '../lib/fixtures';
import { SEED } from '../lib/seed';
import { waitForHydration } from '../lib/hydration';
import { goViaMore, moreButton } from '../lib/more';

const EIN = SEED.companions.ein.id;
const BASE = `/${EIN}/medications`;

/** "YYYY-MM-DDT08:00" two days ahead (local): future, and not due today. */
function inTwoDaysAt8(): string {
	const d = new Date();
	d.setDate(d.getDate() + 2);
	const pad = (n: number) => String(n).padStart(2, '0');
	return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T08:00`;
}

/** Remove what a test created even when it failed halfway. */
function cleanup(app: AppWorker, name: string) {
	const sqlite = new Database(path.join(app.dataDir, 'einvault.db'));
	try {
		sqlite.pragma('foreign_keys = ON');
		sqlite.prepare('DELETE FROM reminders WHERE title = ?').run(name);
		sqlite.prepare('DELETE FROM medications WHERE name = ?').run(name);
	} finally {
		sqlite.close();
	}
}

function setEndedOn(app: AppWorker, name: string, endedOn: string) {
	const sqlite = new Database(path.join(app.dataDir, 'einvault.db'));
	try {
		sqlite.prepare('UPDATE medications SET ended_on = ? WHERE name = ?').run(endedOn, name);
	} finally {
		sqlite.close();
	}
}

async function addMedication(page: Page, name: string) {
	await page.goto(BASE);
	await waitForHydration(page);
	// The header button; an empty list repeats it in the empty state.
	await page.getByRole('button', { name: 'Add medication' }).first().click();
	await page.getByLabel('Name').fill(name);
	await page.getByLabel('Dose').fill('1 tablet');
	await page.locator('#med-instructions').fill('With food');
	await page.getByRole('button', { name: 'Save medication' }).click();
	await expect(page.getByRole('button', { name: 'Save medication' })).toHaveCount(0, {
		timeout: 8_000
	});
}

test.describe('medications (owner)', () => {
	test('adding a medication offers a dose reminder @mobile', async ({ asMember, app }) => {
		const name = `e2e-med-prompt-${Date.now()}`;
		try {
			await addMedication(asMember, name);
			const prompt = asMember.getByRole('alert').filter({ hasText: `Added ${name}.` });
			await expect(prompt).toContainText('Add a dose reminder so each dose gets logged.');
			await prompt.getByRole('link', { name: 'Add a dose reminder' }).click();
			await expect(asMember).toHaveURL(new RegExp(`/${EIN}/reminders`));
			await waitForHydration(asMember);
			await expect(asMember.locator('#title')).toHaveValue(name);
			await expect(asMember.locator('select[name="type"]')).toHaveValue('medication');
			await expect(asMember.locator('input[name="medicationId"]')).toHaveCount(1);

			// Dismissible, and gone on the next visit.
			await addMedication(asMember, `${name}-b`);
			const second = asMember.getByRole('alert').filter({ hasText: `Added ${name}-b.` });
			await second.getByRole('button', { name: 'Dismiss' }).click();
			await expect(second).toHaveCount(0);
			await asMember.goto(BASE);
			await expect(asMember.getByRole('alert').filter({ hasText: 'Added ' })).toHaveCount(0);
		} finally {
			cleanup(app, name);
			cleanup(app, `${name}-b`);
		}
	});

	test('add, schedule, give, end and delete a medication', async ({ asMember, app }) => {
		const name = `e2e-med-${Date.now()}`;
		try {
			await addMedication(asMember, name);
			const active = asMember.getByRole('region', { name: 'Active' });
			await expect(active.getByText(name)).toBeVisible();

			// The detail page offers a dose reminder, prefilled and linked.
			await active.getByRole('link', { name }).click();
			await expect(asMember).toHaveURL(new RegExp(`${BASE}/[^/?]+$`));
			const detailUrl = asMember.url();
			await waitForHydration(asMember);
			await asMember.getByRole('link', { name: 'Add a dose reminder' }).click();
			await expect(asMember).toHaveURL(new RegExp(`/${EIN}/reminders`));
			await waitForHydration(asMember);
			await expect(asMember.locator('#title')).toHaveValue(name);
			await expect(asMember.locator('select[name="type"]')).toHaveValue('medication');
			await expect(asMember.locator('input[name="medicationId"]')).toHaveCount(1);
			// The prefill params are stripped so a reload doesn't reopen the form.
			await expect(asMember).not.toHaveURL(/medicationId=/);
			await asMember.locator('#dueAt').fill(inTwoDaysAt8());
			await asMember.locator('#add-isRecurring').check();
			await asMember.locator('#add-recurrenceInterval').fill('1');
			await asMember.locator('select[name="recurrenceUnit"]').selectOption('day');
			await asMember.getByRole('button', { name: 'Save Reminder' }).click();

			// Saving returns to the medication with its schedule.
			await expect(asMember).toHaveURL(detailUrl, { timeout: 8_000 });
			await expect(asMember.getByText(/every day at/i).first()).toBeVisible();
			const reminders = asMember.getByRole('region', { name: 'Dose reminders' });
			await expect(reminders.getByText(/every day/i)).toBeVisible();

			// The linked reminder offers no "Log event": the dose is logged already.
			await asMember.goto(`/${EIN}/reminders`);
			await waitForHydration(asMember);
			const card = asMember.locator('[data-active-group] > *').filter({ hasText: name });
			await expect(card.getByRole('button', { name: `Log a dose of ${name}` })).toBeVisible();
			await expect(
				card.getByRole('button', { name: 'Mark done and log a Health Event' })
			).toHaveCount(0);
			// It links back to its medication, on the card and in the detail view.
			const medHref = new URL(detailUrl).pathname;
			await expect(card.getByRole('link', { name: `Medication: ${name}` })).toHaveAttribute(
				'href',
				medHref
			);
			// The row's own button, not "Log a dose of {name}".
			await card.getByRole('button', { name: new RegExp(`^\\W*${name}`) }).click();
			const detail = asMember.getByRole('dialog');
			await expect(detail.getByRole('link', { name: `Medication: ${name}` })).toHaveAttribute(
				'href',
				medHref
			);
			await detail.getByRole('button', { name: 'Close', exact: true }).click();

			// Given logs a dose by the member.
			await asMember.goto(detailUrl);
			await waitForHydration(asMember);
			await asMember.getByRole('button', { name: 'Given' }).click();
			const history = asMember.getByRole('region', { name: 'Dose history' });
			await expect(history.getByText(SEED.member.displayName)).toBeVisible({ timeout: 8_000 });
			const removeButtons = history.getByRole('button', { name: 'Remove this dose' });
			await expect(removeButtons).toHaveCount(1);

			// Once given, the button turns quiet, shows when, and asks before
			// logging another dose. Cancel logs nothing; confirming logs one more.
			const givenAgain = asMember.getByRole('button', { name: /^Given \S/ });
			await expect(givenAgain).toBeVisible();
			await givenAgain.click();
			const againDialog = asMember.getByRole('dialog');
			await expect(againDialog).toContainText('already given');
			await againDialog.getByRole('button', { name: 'Cancel' }).click();
			await expect(againDialog).toHaveCount(0);
			await expect(removeButtons).toHaveCount(1);
			await givenAgain.click();
			await asMember.getByRole('dialog').getByRole('button', { name: 'Log another dose' }).click();
			await expect(removeButtons).toHaveCount(2, { timeout: 8_000 });
			await removeButtons.first().click();
			await asMember
				.getByRole('dialog')
				.getByRole('button', { name: 'Remove', exact: true })
				.click();
			await expect(removeButtons).toHaveCount(1, { timeout: 8_000 });

			// A mistaken dose can be removed; the dialog says a reminder would stay done.
			await history.getByRole('button', { name: 'Remove this dose' }).click();
			const removeDialog = asMember.getByRole('dialog');
			await expect(removeDialog).toContainText('stays done');
			await removeDialog.getByRole('button', { name: 'Remove', exact: true }).click();
			await expect(history.getByText('No doses logged yet.')).toBeVisible({ timeout: 8_000 });

			// End makes today the last day: still active (a dose can be logged until
			// midnight), shown as ending today, and its reminder is gone.
			await asMember.getByRole('button', { name: 'End', exact: true }).click();
			await asMember.getByRole('dialog').getByRole('button', { name: 'End medication' }).click();
			await expect(asMember.getByText('Ends today')).toBeVisible({ timeout: 8_000 });
			await expect(asMember.getByRole('button', { name: 'End now' })).toBeVisible();
			await expect(asMember.getByRole('button', { name: 'Remove end date' })).toBeVisible();
			await expect(asMember.getByRole('button', { name: 'Given' })).toBeVisible();
			await asMember.goto(BASE);
			await expect(asMember.getByRole('region', { name: 'Active' }).getByText(name)).toBeVisible();
			await asMember.goto(`/${EIN}/reminders`);
			await expect(asMember.getByText(name)).toHaveCount(0);

			// Once its last day has passed it is listed as Ended and can restart.
			setEndedOn(app, name, '2020-01-01');
			await asMember.goto(BASE);
			await expect(asMember.getByRole('region', { name: 'Ended' }).getByText(name)).toBeVisible();
			await expect(asMember.getByRole('region', { name: 'Active' }).getByText(name)).toHaveCount(0);
			await asMember.goto(detailUrl);
			await waitForHydration(asMember);
			await expect(asMember.getByRole('button', { name: 'Given' })).toHaveCount(0);
			await asMember.getByRole('button', { name: 'Restart' }).click();
			await expect(asMember.getByRole('button', { name: 'End', exact: true })).toBeVisible({
				timeout: 8_000
			});
			await expect(asMember.getByRole('button', { name: 'Given' })).toBeVisible();

			// Delete asks first, then returns to the list.
			await asMember.goto(detailUrl);
			await waitForHydration(asMember);
			await asMember.getByRole('button', { name: 'Delete' }).click();
			const confirm = asMember.getByRole('dialog');
			await expect(confirm).toContainText(name);
			await confirm.getByRole('button', { name: 'Delete' }).click();
			await expect(asMember).toHaveURL(new RegExp(`${BASE}$`), { timeout: 8_000 });
			await expect(asMember.getByText(name)).toHaveCount(0);
		} finally {
			cleanup(app, name);
		}
	});

	test('edit a medication from its page', async ({ asMember, app }) => {
		const name = `e2e-med-edit-${Date.now()}`;
		try {
			await addMedication(asMember, name);
			await asMember.getByRole('region', { name: 'Active' }).getByRole('link', { name }).click();
			await expect(asMember).toHaveURL(new RegExp(`${BASE}/[^/?]+$`));
			await waitForHydration(asMember);
			await asMember.getByRole('link', { name: 'Edit', exact: true }).click();
			await asMember.locator('#med-dose').fill('2 tablets');
			await asMember.getByRole('button', { name: 'Save medication' }).click();
			await expect(asMember.getByRole('button', { name: 'Save medication' })).toHaveCount(0, {
				timeout: 8_000
			});
			await expect(asMember.getByText('2 tablets').first()).toBeVisible();
		} finally {
			cleanup(app, name);
		}
	});

	test('sidebar links to Medications', async ({ asMember }, testInfo) => {
		test.skip(testInfo.project.name === 'mobile', 'the sidebar is desktop-only');
		await asMember.goto(`/${EIN}`);
		await asMember.getByRole('link', { name: 'Medications', exact: true }).click();
		await expect(asMember).toHaveURL(new RegExp(`${BASE}$`));
		await expect(asMember.getByRole('heading', { name: 'Medications', level: 1 })).toBeVisible();
	});

	test('More › Medications on mobile @mobile', async ({ asMember }, testInfo) => {
		test.skip(testInfo.project.name !== 'mobile', 'the More sheet is mobile-only');
		await asMember.goto(`/${EIN}`);
		await goViaMore(asMember, 'Medications');
		await expect(asMember).toHaveURL(new RegExp(`${BASE}$`));
		await expect(await moreButton(asMember)).toHaveAccessibleName(/current section/);
	});
});
