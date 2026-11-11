import type { Page } from '@playwright/test';
import { test, expect, setupAdminAndLogIn } from '../lib/pristine';
import { test as seeded } from '../lib/fixtures';
import { SEED } from '../lib/seed';
import { waitForHydration } from '../lib/hydration';

const card = (page: Page) => page.getByTestId('getting-started');

/** Adds a pet through the UI on a pristine server; the page lands on its dashboard. */
async function addPet(page: Page, base: string, name: string): Promise<string> {
	await page.goto(base + '/companions/new');
	await waitForHydration(page);
	await page.locator('#name').fill(name);
	await page.getByRole('button', { name: 'Add Companion' }).click();
	await expect(page).not.toHaveURL(/\/companions\/new/, { timeout: 10_000 });
	return new URL(page.url()).pathname.split('/').filter(Boolean)[0];
}

async function openDashboard(page: Page, base: string, pet: string) {
	await page.goto(`${base}/${pet}`);
	await waitForHydration(page);
	await expect(card(page)).toBeVisible();
}

async function logActivity(page: Page) {
	await waitForHydration(page);
	await page.getByRole('button', { name: /^Log / }).click();
	await expect(page.getByText(/Activity logged/)).toBeVisible({ timeout: 8_000 });
}

/** Nothing sticks out of the card, and the card itself doesn't scroll sideways. */
async function expectCardFits(page: Page) {
	const overflow = await card(page).evaluate((root) => {
		const box = root.getBoundingClientRect();
		const outside = [...root.querySelectorAll('*')].filter((el) => {
			const r = el.getBoundingClientRect();
			return r.width > 0 && (r.right > box.right + 0.5 || r.left < box.left - 0.5);
		});
		return {
			scrolls: root.scrollWidth > root.clientWidth,
			outside: outside.map((el) => el.outerHTML.slice(0, 80))
		};
	});
	expect(overflow).toEqual({ scrolls: false, outside: [] });
}

function inTwoDaysAt8(): string {
	const d = new Date();
	d.setDate(d.getDate() + 2);
	const pad = (n: number) => String(n).padStart(2, '0');
	return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T08:00`;
}

test.describe('getting started card', () => {
	test.setTimeout(120_000);

	test('a fresh install shows the card and ticks a step from real data', async ({
		pristine,
		page
	}) => {
		const base = pristine.baseURL;
		await setupAdminAndLogIn(page, pristine);
		const pet = await addPet(page, base, 'Rocket');
		await openDashboard(page, base, pet);

		const c = card(page);
		await expect(c.getByRole('heading', { name: 'Getting started' })).toBeVisible();
		await expect(
			c.getByText('See how the pieces connect. Steps tick off as you use EinVault.')
		).toBeVisible();
		await expect(c.getByText('0 of 4')).toBeVisible();
		// Admins see the optional caretaker step, outside the count.
		const caretaker = c.getByTestId('getting-started-caretaker');
		await expect(caretaker.getByText('Invite a caretaker')).toBeVisible();
		await expect(caretaker.getByText('Optional')).toBeVisible();
		await expect(caretaker.getByRole('link', { name: 'Invite a caretaker' })).toHaveAttribute(
			'href',
			'/admin/users'
		);
		await expect(c.getByRole('link', { name: 'Settings > Quick logs' })).toHaveAttribute(
			'href',
			'/settings/quick-logs'
		);

		await c.getByRole('link', { name: 'Log something with a quick-log tile' }).click();
		await expect(page).toHaveURL(new RegExp(`/${pet}/log$`));
		await logActivity(page);

		await openDashboard(page, base, pet);
		await expect(c.getByText('1 of 4')).toBeVisible();
		const done = c.getByTestId('getting-started-done');
		await expect(done).toHaveText(/Log something with a quick-log tile/);
		await expect(done.locator('[data-struck]')).toHaveCSS('text-decoration-line', 'line-through');

		// A half-done step 4 shows its sub-ticks even while the journal step is current.
		await page.goto(`${base}/${pet}/supplies/new`);
		await waitForHydration(page);
		await page.locator('#supply-name').fill('Apoquel tablets');
		await page.locator('#supply-unit').fill('tablets');
		await page.locator('#supply-startingQuantity').fill('30');
		await page.getByRole('button', { name: 'Save supply' }).click();
		await expect(page).toHaveURL(/\/supplies\/(?!new$)[^/]+$/, { timeout: 8_000 });
		await openDashboard(page, base, pet);
		await expect(c.getByText('1 of 4')).toBeVisible();
		await expect(c.getByRole('link', { name: "Write today's journal entry" })).toBeVisible();
		await expect(c.getByText('Add a supply')).toHaveCSS('text-decoration-line', 'line-through');
		await expect(c.getByRole('link', { name: 'Add a medication that uses it' })).toHaveAttribute(
			'href',
			`/${pet}/medications`
		);
	});

	test('the medication chain ticks step 4, then all set, and X hides the card', async ({
		pristine,
		page
	}) => {
		const base = pristine.baseURL;
		await setupAdminAndLogIn(page, pristine);
		const pet = await addPet(page, base, 'Rocket');
		await openDashboard(page, base, pet);
		const c = card(page);

		// Steps 1 to 3 through the card's own links.
		await c.getByRole('link', { name: 'Log something with a quick-log tile' }).click();
		await logActivity(page);

		await openDashboard(page, base, pet);
		await c.getByRole('link', { name: "Write today's journal entry" }).click();
		await expect(page).toHaveURL(new RegExp(`/${pet}/journal/\\d{4}-\\d{2}-\\d{2}$`));
		await waitForHydration(page);
		await page.locator('textarea').fill('First day home');
		await page.locator('button[title="Good"]').click();
		await page.locator('h1').first().click();
		await expect(page.getByText('✓ Saved')).toBeVisible({ timeout: 8_000 });

		await openDashboard(page, base, pet);
		await c.getByRole('link', { name: 'Log a vet visit or a weight' }).click();
		await expect(page).toHaveURL(new RegExp(`/${pet}/health$`));
		await waitForHydration(page);
		await page.getByRole('button', { name: 'Log Weight' }).click();
		await page.locator('#weight').fill('12.5');
		await page.getByRole('button', { name: 'Log Weight' }).last().click();
		await expect(
			page.locator('section').filter({ hasText: 'Weight History' }).getByText(/12\.5/)
		).toBeVisible({ timeout: 8_000 });

		// Three done fold into one line and the subtitle changes.
		await openDashboard(page, base, pet);
		await expect(c.getByText('3 of 4')).toBeVisible();
		await expect(c.getByText("One link you haven't used yet.")).toBeVisible();
		const fold = c.getByRole('button', { name: '3 done: quick logs, journal, health' });
		await expect(fold).toHaveAttribute('aria-expanded', 'false');
		await fold.click();
		await expect(fold).toHaveAttribute('aria-expanded', 'true');
		await expect(c.getByText("Write today's journal entry")).toBeVisible();

		// Step 4, one sub-tick at a time, each from the card.
		await c.getByRole('link', { name: 'Add a supply' }).click();
		await expect(page).toHaveURL(new RegExp(`/${pet}/supplies/new$`));
		await waitForHydration(page);
		await page.locator('#supply-name').fill('Apoquel tablets');
		await page.locator('#supply-unit').fill('tablets');
		await page.locator('#supply-startingQuantity').fill('30');
		await page.getByRole('button', { name: 'Save supply' }).click();
		await expect(page).toHaveURL(/\/supplies\/(?!new$)[^/]+$/, { timeout: 8_000 });

		await openDashboard(page, base, pet);
		await c.getByRole('link', { name: 'Add a medication that uses it' }).click();
		await expect(page).toHaveURL(new RegExp(`/${pet}/medications$`));
		await waitForHydration(page);
		await page.getByRole('button', { name: 'Add medication' }).first().click();
		await page.getByLabel('Name').fill('Apoquel');
		await page.locator('#med-supplyId').selectOption({ label: 'Apoquel tablets' });
		await page.getByRole('button', { name: 'Save medication' }).click();
		await expect(page.getByRole('button', { name: 'Save medication' })).toHaveCount(0, {
			timeout: 8_000
		});

		// The reminder sub-tick names the medication and links to it.
		await openDashboard(page, base, pet);
		await c.getByRole('link', { name: 'Add a dose reminder to Apoquel' }).click();
		await expect(page).toHaveURL(new RegExp(`/${pet}/medications/[^/?]+$`));
		await waitForHydration(page);
		await page.getByRole('link', { name: 'Add a dose reminder' }).click();
		await expect(page).toHaveURL(new RegExp(`/${pet}/reminders`));
		await waitForHydration(page);
		await page.locator('#dueAt').fill(inTwoDaysAt8());
		await page.getByRole('button', { name: 'Save Reminder' }).click();
		await expect(page).toHaveURL(new RegExp(`/${pet}/medications/[^/?]+$`), { timeout: 8_000 });

		await openDashboard(page, base, pet);
		await c.getByRole('link', { name: 'Mark a dose Done' }).click();
		await expect(page).toHaveURL(new RegExp(`/${pet}/reminders$`));
		await waitForHydration(page);
		const reminder = page.locator('[data-active-group] > *').filter({ hasText: 'Apoquel' });
		await reminder.getByRole('button', { name: 'Log a dose of Apoquel' }).click();
		// Wait out the undo window: the reminder lands in the completed list.
		await expect(page.locator('details').filter({ hasText: 'Apoquel' })).toBeAttached({
			timeout: 15_000
		});

		await openDashboard(page, base, pet);
		await expect(c.getByText('All set. Every step is done.')).toBeVisible();
		await expect(c.getByText('4 of 4')).toBeVisible();

		// X hides it without a reload, and it stays hidden.
		await c.getByRole('button', { name: 'Hide getting started' }).click();
		await expect(card(page)).toHaveCount(0);
		await page.reload();
		await waitForHydration(page);
		await expect(page.getByRole('heading', { name: 'Rocket', level: 1 })).toBeVisible();
		await expect(card(page)).toHaveCount(0);
	});

	test('the household page offers one button per pet', async ({ pristine, page }) => {
		const base = pristine.baseURL;
		await setupAdminAndLogIn(page, pristine);
		const rocket = await addPet(page, base, 'Rocket');
		const comet = await addPet(page, base, 'Comet');

		await page.goto(base + '/');
		await waitForHydration(page);
		const c = card(page);
		await expect(c).toBeVisible();
		await expect(c.getByRole('link', { name: 'For Rocket' })).toHaveAttribute(
			'href',
			`/${rocket}/log`
		);
		await expect(c.getByRole('link', { name: 'For Comet' })).toHaveAttribute(
			'href',
			`/${comet}/log`
		);
	});

	test('the card fits a 360px phone in German @mobile', async ({ pristine, page }) => {
		const base = pristine.baseURL;
		await setupAdminAndLogIn(page, pristine);
		const rocket = await addPet(page, base, 'Rocket');
		await addPet(page, base, 'Comet');
		await page.goto(base + '/settings');
		await waitForHydration(page);
		await page.locator('select[name="locale"]').selectOption('de');
		await page.waitForLoadState('networkidle');
		await expect(page.locator('html')).toHaveAttribute('lang', 'de');

		await page.setViewportSize({ width: 360, height: 740 });
		await page.goto(base + '/');
		await waitForHydration(page);
		const c = card(page);
		await expect(c.getByRole('heading', { name: 'Erste Schritte' })).toBeVisible();
		expect(await page.evaluate(() => window.innerWidth)).toBe(360);
		await expectCardFits(page);
		const hide = c.getByRole('button', { name: 'Erste Schritte ausblenden' });
		const box = (await hide.boundingBox())!;
		expect(box.width).toBeGreaterThanOrEqual(44);
		expect(box.height).toBeGreaterThanOrEqual(44);

		// A one-pet household lands on the dashboard. Its quick-log tiles can widen
		// the page in German, so only the card itself is checked there.
		await page.goto(`${base}/${rocket}`);
		await waitForHydration(page);
		await expect(c.getByRole('heading', { name: 'Erste Schritte' })).toBeVisible();
		await expectCardFits(page);
	});
});

seeded.describe('getting started card (seeded household)', () => {
	seeded('seeded owners never see it: the household is complete', async ({ asMember, asAdmin }) => {
		const ein = SEED.companions.ein;
		await asMember.goto(`/${ein.id}`);
		await waitForHydration(asMember);
		await expect(asMember.getByRole('heading', { name: ein.name, level: 1 })).toBeVisible();
		await expect(card(asMember)).toHaveCount(0);

		await asAdmin.goto('/');
		await waitForHydration(asAdmin);
		await expect(asAdmin.getByRole('heading', { name: 'Your companions' })).toBeVisible();
		await expect(card(asAdmin)).toHaveCount(0);
	});
});
