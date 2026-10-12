import type { Page } from '@playwright/test';
import { test, expect } from '../lib/fixtures';
import { SEED } from '../lib/seed';
import { pngUpload, mp4Upload } from '../lib/files';
import { waitForHydration } from '../lib/hydration';

// Printable caretaker sheet (#280). Print checks emulate print media and always
// reset it. Include choices are page state, so nothing here writes seeded data;
// the photo test's scratch note is deleted in finally.
const EIN = SEED.companions.ein.id;
const EDWARD = SEED.companions.edward.id;
const C = SEED.companions.ein;
const N = SEED.notes;
const M = SEED.noteMedia;
const FOOTER = /^Printed .+ from EinVault$/;

async function openSheet(page: Page) {
	await page.goto(`/${EIN}/sheet`);
	await waitForHydration(page);
}

const noteCard = (page: Page, title: string) => page.locator('article').filter({ hasText: title });

const include = (page: Page, name: string) =>
	page.getByRole('checkbox', { name: `Include ${name}`, exact: true });

async function inPrint(page: Page, check: () => Promise<void>) {
	await page.emulateMedia({ media: 'print' });
	try {
		await check();
	} finally {
		await page.emulateMedia({ media: null });
	}
}

test.describe('caretaker sheet', () => {
	test('owner opens it from the overview; only shared notes appear', async ({ asMember }) => {
		await asMember.goto(`/${EIN}`);
		await asMember.getByRole('link', { name: 'Print caretaker sheet' }).click();
		await expect(asMember).toHaveURL(new RegExp(`/${EIN}/sheet$`));

		await expect(asMember.getByRole('heading', { level: 1, name: C.name })).toBeVisible();
		await expect(asMember.getByText(C.feedingSchedule)).toBeVisible();
		await expect(asMember.getByText(C.vetPhone, { exact: true })).toBeVisible();
		await expect(noteCard(asMember, N.einCommands.title)).toBeVisible();
		await expect(asMember.locator(`img[src*="${M.einCommands.filename}"]`)).toBeVisible();
		await expect(asMember.getByText(N.einPrivate.title)).toHaveCount(0);
		await expect(asMember.locator(`img[src*="${M.einPrivate.filename}"]`)).toHaveCount(0);
	});

	test('the edit page previews the sheet in a new tab', async ({ asMember }) => {
		await asMember.goto(`/companions/${EIN}/edit`);
		await waitForHydration(asMember);
		await asMember.getByRole('button', { name: 'Caretaker info', exact: true }).click();
		const link = asMember.getByRole('link', {
			name: 'Preview caretaker sheet (opens in a new tab)'
		});
		await expect(link).toHaveAttribute('href', `/${EIN}/sheet`);
		await expect(link).toHaveAttribute('target', '_blank');
	});

	test('an excluded note is dimmed on screen and left out of print @mobile', async ({
		asMember
	}) => {
		await openSheet(asMember);
		const commands = noteCard(asMember, N.einCommands.title);
		await include(asMember, N.einCommands.title).uncheck();
		await expect(commands.getByText('Not printed', { exact: true })).toBeVisible();
		await expect(commands.locator('.opacity-40')).toHaveCount(1);

		await inPrint(asMember, async () => {
			await expect(commands).toBeHidden();
			await expect(noteCard(asMember, N.einSitter.title)).toBeVisible();
			await expect(asMember.getByRole('heading', { name: 'Notes', exact: true })).toBeVisible();
			await expect(asMember.getByRole('button', { name: 'Print', exact: true })).toBeHidden();
			await expect(asMember.getByText('Not printed', { exact: true })).toBeHidden();
			// Sidebar, mobile header and bottom tab bar: the sheet itself has none
			// of these elements.
			await expect(asMember.locator('nav:visible, aside:visible, header:visible')).toHaveCount(0);
			await expect(asMember.getByText(FOOTER)).toBeVisible();
		});

		// With every note excluded, no orphan "Notes" heading prints.
		await include(asMember, N.einSitter.title).uncheck();
		await inPrint(asMember, async () => {
			await expect(asMember.getByRole('heading', { name: 'Notes', exact: true })).toBeHidden();
			await expect(asMember.getByText(FOOTER)).toBeVisible();
		});
	});

	test('photo choices: master toggle, count, note exclusion and print', async ({ asMember }) => {
		const title = 'E2E Sheet photos';
		let noteUrl: string | null = null;
		try {
			await asMember.goto(`/${EIN}/notes/new`);
			await waitForHydration(asMember);
			await asMember.getByLabel('Title', { exact: true }).fill(title);
			await asMember.getByLabel('Share with caretakers').check();
			await asMember.getByRole('button', { name: 'Save', exact: true }).click();
			await expect(asMember).toHaveURL(new RegExp(`/${EIN}/notes/(?!new)[^/?]+$`));
			noteUrl = asMember.url();
			const noteId = new URL(noteUrl).pathname.split('/').pop()!;
			await waitForHydration(asMember);
			await asMember
				.locator('input[type="file"][name="photos"]')
				.first()
				.setInputFiles([
					pngUpload('sheet-a.png'),
					pngUpload('sheet-b.png'),
					mp4Upload('sheet-clip.mp4')
				]);
			await expect
				.poll(
					async () => {
						const res = await asMember.request.get(`/api/companions/${EIN}/notes/${noteId}/media`);
						return (await res.json()).media.length;
					},
					{ timeout: 15_000 }
				)
				.toBe(3);

			await openSheet(asMember);
			const master = asMember.getByRole('checkbox', { name: 'Include photos', exact: true });
			const count = (n: number) => asMember.getByText(`${n} of 3 photos included`, { exact: true });
			const photoA = include(asMember, 'photo sheet-a.png');
			const photoB = include(asMember, 'photo sheet-b.png');
			const indeterminate = () => master.evaluate((el) => (el as HTMLInputElement).indeterminate);

			// The video prints as a line and is not counted as a photo.
			await expect(
				noteCard(asMember, title).getByText('Video in EinVault', { exact: true })
			).toBeVisible();
			await expect(count(3)).toBeVisible();
			await expect(master).toBeChecked();

			await master.uncheck();
			await expect(count(0)).toBeVisible();
			await expect(photoA).not.toBeChecked();

			await photoA.check();
			await expect(count(1)).toBeVisible();
			expect(await indeterminate()).toBe(true);

			// Excluding the note leaves the photo choices and the count alone;
			// including it again brings them back as they were.
			await include(asMember, title).uncheck();
			await expect(count(1)).toBeVisible();
			expect(await indeterminate()).toBe(true);
			await include(asMember, title).check();
			await expect(photoA).toBeChecked();
			await expect(photoB).not.toBeChecked();

			await inPrint(asMember, async () => {
				await expect(asMember.getByRole('img', { name: 'sheet-a.png', exact: true })).toBeVisible();
				await expect(asMember.getByRole('img', { name: 'sheet-b.png', exact: true })).toBeHidden();
				await expect(
					asMember.getByRole('img', { name: M.einCommands.caption, exact: true })
				).toBeHidden();
			});
		} finally {
			// Leave no note behind in the shared worker DB, even if an assertion failed.
			if (noteUrl) {
				await asMember.goto(noteUrl);
				await asMember.getByRole('button', { name: 'Delete note' }).click();
				await asMember.getByRole('dialog').getByRole('button', { name: 'Delete' }).click();
				await expect(asMember).toHaveURL(new RegExp(`/${EIN}/notes$`));
			}
		}
	});

	test('an excluded household owner is left out of print', async ({ asMember }) => {
		await openSheet(asMember);
		const household = asMember.locator('section').filter({
			has: asMember.getByRole('heading', { name: 'Household Contacts', exact: true })
		});
		await include(asMember, SEED.admin.displayName).uncheck();
		await inPrint(asMember, async () => {
			await expect(household.getByText(SEED.admin.displayName, { exact: true })).toBeHidden();
			await expect(household.getByText(SEED.member.displayName, { exact: true })).toBeVisible();
		});
	});

	test('caretaker opens it from the care page; unassigned is 403', async ({ asCaretaker }) => {
		await asCaretaker.goto(`/care/${EIN}`);
		await asCaretaker.getByRole('link', { name: 'Print sheet', exact: true }).click();
		await expect(asCaretaker).toHaveURL(new RegExp(`/care/${EIN}/sheet$`));
		await expect(asCaretaker.getByRole('heading', { level: 1, name: C.name })).toBeVisible();
		await expect(noteCard(asCaretaker, N.einCommands.title)).toBeVisible();
		await expect(asCaretaker.locator(`img[src*="${M.einCommands.filename}"]`)).toBeVisible();

		const res = await asCaretaker.goto(`/care/${EDWARD}/sheet`);
		expect(res?.status()).toBe(403);
	});

	test('without JavaScript the full sheet renders with no controls', async ({ app, browser }) => {
		const ctx = await browser.newContext({
			baseURL: app.server.baseURL,
			storageState: await app.stateFor('member', browser),
			javaScriptEnabled: false
		});
		try {
			const page = await ctx.newPage();
			await page.goto(`/${EIN}/sheet`);
			await expect(page.getByRole('heading', { level: 1, name: C.name })).toBeVisible();
			await expect(page.getByText(C.vetPhone, { exact: true })).toBeVisible();
			await expect(noteCard(page, N.einCommands.title)).toBeVisible();
			await expect(page.locator('main').getByRole('checkbox')).toHaveCount(0);
			await expect(page.getByRole('button', { name: 'Print', exact: true })).toHaveCount(0);
			await expect(page.getByText(FOOTER)).toBeVisible();
		} finally {
			await ctx.close();
		}
	});

	test('a dark theme still prints on a white page', async ({ asMember }) => {
		// The seeded member's theme is 'system', so an emulated dark scheme turns
		// on the dark class through the app's own code. Nothing is saved.
		await asMember.emulateMedia({ colorScheme: 'dark' });
		try {
			await openSheet(asMember);
			await expect(asMember.locator('html')).toHaveClass(/\bdark\b/);
			const bodyBg = () => asMember.evaluate(() => getComputedStyle(document.body).backgroundColor);
			expect(await bodyBg()).not.toBe('rgb(255, 255, 255)');

			await asMember.emulateMedia({ media: 'print', colorScheme: 'dark' });
			await expect.poll(bodyBg).toBe('rgb(255, 255, 255)');
			const name = asMember.getByRole('heading', { level: 1, name: C.name });
			await expect
				.poll(() => name.evaluate((el) => getComputedStyle(el).color))
				.toBe('rgb(0, 0, 0)');
		} finally {
			await asMember.emulateMedia({ media: null, colorScheme: null });
		}
	});
});
