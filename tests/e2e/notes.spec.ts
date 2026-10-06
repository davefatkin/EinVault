import { test as base, type Browser, type Page } from '@playwright/test';
import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import { test, expect, type AppWorker } from '../lib/fixtures';
import { createSeededDb, createSeededDbNoShift, SEED } from '../lib/seed';
import { startAppServer, type AppServer } from '../lib/app-server';
import { getFreePort } from '../lib/ports';
import { createToken } from '../lib/api-tokens';
import { pngUpload, mp4Upload } from '../lib/files';
import { waitForHydration } from '../lib/hydration';

const EIN = SEED.companions.ein.id;
const JULIA = SEED.companions.julia.id;
const EDWARD = SEED.companions.edward.id;
const N = SEED.notes;
const M = SEED.noteMedia;
const MEDIA_HINT = 'Save the note to add photos and videos.';
const REPO_ROOT = path.resolve(import.meta.dirname, '../..');

// Force SvelteKit's JSON action response so fail() status lands in the body.
async function postAction(page: Page, baseURL: string, url: string, form: Record<string, string>) {
	const res = await page.request.post(url, {
		headers: { Origin: baseURL, Accept: 'application/json' },
		form
	});
	return { status: res.status(), body: await res.json() };
}

async function fillNewNote(page: Page, title: string, body: string, tags: string[]) {
	await page.goto(`/${EIN}/notes/new`);
	await page.getByLabel('Title', { exact: true }).fill(title);
	await page.locator('#note-body').fill(body);
	const tagBox = page.getByRole('combobox');
	for (const tag of tags) {
		await tagBox.fill(tag);
		await tagBox.press('Enter');
	}
}

// Creates a note owned by the test so media tests never touch seeded notes.
async function createScratchNote(page: Page, title: string): Promise<string> {
	await fillNewNote(page, title, 'media scratch', []);
	await page.getByRole('button', { name: 'Save', exact: true }).click();
	await expect(page).toHaveURL(new RegExp(`/${EIN}/notes/(?!new)[^/?]+$`));
	return page.url();
}

async function deleteNoteAt(page: Page, noteUrl: string) {
	await page.goto(noteUrl);
	await page.getByRole('button', { name: 'Delete note' }).click();
	await page.getByRole('dialog').getByRole('button', { name: 'Delete' }).click();
	await expect(page).toHaveURL(new RegExp(`/${EIN}/notes$`));
}

// A member page with JavaScript off, for no-JS form fallbacks.
async function noJsMember(app: AppWorker, browser: Browser) {
	const ctx = await browser.newContext({
		baseURL: app.server.baseURL,
		storageState: await app.stateFor('member', browser),
		javaScriptEnabled: false
	});
	return ctx.newPage();
}

// After a failed no-JS submit the tag text is back in the input, flagged inline,
// and the form-level alert repeats the server's message.
async function expectTagError(page: Page, text: string) {
	const tagBox = page.getByRole('combobox');
	await expect(tagBox).toHaveValue(text);
	await expect(tagBox).toHaveAttribute('aria-invalid', 'true');
	await expect(
		page.getByRole('alert').filter({ hasText: 'Each tag must be 1 to 32 characters.' })
	).toHaveCount(2);
}

test.describe('notes (owner)', () => {
	test('create with tags, filter, edit away a tag, pin, delete', async ({ asMember }) => {
		await fillNewNote(asMember, 'E2E Favorite foods', 'Loves *pumpkin*', ['Food', 'treats']);
		await asMember.getByRole('button', { name: 'Save', exact: true }).click();
		await expect(asMember).toHaveURL(new RegExp(`/${EIN}/notes/(?!new)[^/?]+$`));
		await expect(asMember.getByRole('heading', { name: 'E2E Favorite foods' })).toBeVisible();
		await expect(asMember.getByText('pumpkin')).toBeVisible();
		const noteUrl = asMember.url();

		// The list has a chip for each tag and the chip filters.
		await asMember.goto(`/${EIN}/notes`);
		const chips = asMember.getByRole('navigation', { name: 'Filter by tag' });
		await chips.getByRole('link', { name: /^treats/ }).click();
		await expect(asMember.getByRole('link', { name: 'E2E Favorite foods' })).toBeVisible();
		await expect(asMember.getByRole('link', { name: N.einPrivate.title })).toHaveCount(0);

		// Remove the only "treats" tag: its chip disappears.
		await asMember.goto(`${noteUrl}?edit=1`);
		await asMember.getByRole('button', { name: 'Remove tag treats' }).click();
		await asMember.getByRole('button', { name: 'Save', exact: true }).click();
		await expect(asMember).toHaveURL(noteUrl);
		await asMember.goto(`/${EIN}/notes`);
		await expect(chips.getByRole('link', { name: /^treats/ })).toHaveCount(0);

		// Pin moves it to the top and is not an edit. The toggle keeps its name;
		// aria-pressed carries the state.
		const card = asMember.locator('article').filter({ hasText: 'E2E Favorite foods' });
		await card.getByRole('button', { name: 'Pin', exact: true, pressed: false }).click();
		await expect(
			card.getByRole('button', { name: 'Pin', exact: true, pressed: true })
		).toBeVisible();
		await expect(asMember.locator('article').first()).toContainText('E2E Favorite foods');
		await expect(card).not.toContainText('edited by');

		// The detail page toggle works the same way.
		await asMember.goto(noteUrl);
		const detailPin = asMember.getByRole('button', { name: 'Pin', exact: true });
		await expect(detailPin).toHaveAttribute('aria-pressed', 'true');
		await detailPin.click();
		await expect(detailPin).toHaveAttribute('aria-pressed', 'false');

		// Delete.
		await asMember.goto(noteUrl);
		await asMember.getByRole('button', { name: 'Delete note' }).click();
		await asMember.getByRole('dialog').getByRole('button', { name: 'Delete' }).click();
		await expect(asMember).toHaveURL(new RegExp(`/${EIN}/notes$`));
		await expect(asMember.getByRole('link', { name: 'E2E Favorite foods' })).toHaveCount(0);
	});

	test('list cards show a media count only for notes with media', async ({ asAdmin }) => {
		await asAdmin.goto(`/${EIN}/notes`);
		const withMedia = asAdmin.locator('article').filter({ hasText: N.einCommands.title });
		await expect(withMedia.getByTestId('note-media-count')).toHaveText('1');
		const without = asAdmin.locator('article').filter({ hasText: N.einSitter.title });
		await expect(without).toBeVisible();
		await expect(without.getByTestId('note-media-count')).toHaveCount(0);
	});

	test("pinning someone else's note is not an edit", async ({ asAdmin }) => {
		// Jet logged the seed note; Spike pinning it must not add "edited by Spike".
		await asAdmin.goto(`/${EIN}/notes`);
		const card = asAdmin.locator('article').filter({ hasText: N.einCommands.title });
		try {
			await card.getByRole('button', { name: 'Pin', exact: true, pressed: false }).click();
			await expect(
				card.getByRole('button', { name: 'Pin', exact: true, pressed: true })
			).toBeVisible();
			await expect(card).not.toContainText('edited by');
			await asAdmin.goto(`/${EIN}/notes/${N.einCommands.id}`);
			await expect(
				asAdmin.getByRole('heading', { name: N.einCommands.title, exact: true })
			).toBeVisible();
			await expect(asAdmin.getByText('edited by')).toHaveCount(0);
		} finally {
			await asAdmin.goto(`/${EIN}/notes`);
			const again = asAdmin.locator('article').filter({ hasText: N.einCommands.title });
			const unpin = again.getByRole('button', { name: 'Pin', exact: true, pressed: true });
			if (await unpin.count()) {
				await unpin.click();
				await expect(
					again.getByRole('button', { name: 'Pin', exact: true, pressed: false })
				).toBeVisible();
			}
		}
	});

	test('pasted comma-separated tags and turning sharing off', async ({ asMember }) => {
		const title = 'E2E Paste tags';
		const save = asMember.getByRole('button', { name: 'Save', exact: true });
		const tags = ['one', 'two', 'three'];
		let noteUrl: string | null = null;
		try {
			await fillNewNote(asMember, title, '', []);
			await asMember.getByRole('combobox').fill('one, two, three');
			await asMember.getByLabel('Share with caretakers').check();
			await save.click();
			await expect(asMember).toHaveURL(new RegExp(`/${EIN}/notes/(?!new)[^/?]+$`));
			noteUrl = asMember.url();
			for (const tag of tags) {
				await expect(asMember.getByRole('link', { name: tag, exact: true })).toBeVisible();
			}
			await expect(asMember.getByText('Shared', { exact: true })).toBeVisible();

			await asMember.goto(`${noteUrl}?edit=1`);
			await asMember.getByLabel('Share with caretakers').uncheck();
			for (const tag of tags) {
				await asMember.getByRole('button', { name: `Remove tag ${tag}` }).click();
			}
			await save.click();
			await expect(asMember).toHaveURL(noteUrl);
			await expect(asMember.getByRole('heading', { name: title })).toBeVisible();
			await expect(asMember.getByText('Shared', { exact: true })).toHaveCount(0);
			for (const tag of tags) {
				await expect(asMember.getByRole('link', { name: tag, exact: true })).toHaveCount(0);
			}

			// Persisted: a fresh read view and the list card show neither badge nor chips.
			await asMember.reload();
			await expect(asMember.getByRole('heading', { name: title })).toBeVisible();
			await expect(asMember.getByText('Shared', { exact: true })).toHaveCount(0);
			await asMember.goto(`/${EIN}/notes`);
			const card = asMember.locator('article').filter({ hasText: title });
			await expect(card).toBeVisible();
			await expect(card.getByText('Shared', { exact: true })).toHaveCount(0);
			await expect(card.getByRole('list', { name: 'Tags' })).toHaveCount(0);
		} finally {
			// Leave no note behind in the shared worker DB, even if an assertion failed.
			if (noteUrl) {
				await asMember.goto(noteUrl);
				await asMember.getByRole('button', { name: 'Delete note' }).click();
				await asMember.getByRole('dialog').getByRole('button', { name: 'Delete' }).click();
				await expect(asMember).toHaveURL(new RegExp(`/${EIN}/notes$`));
				await expect(asMember.getByRole('link', { name: title })).toHaveCount(0);
			}
		}
	});

	test('editor: cancel discards, dirty navigation asks, Ctrl+S saves', async ({ asMember }) => {
		await asMember.goto(`/${EIN}/notes/${N.einCommands.id}?edit=1`);
		await asMember.getByLabel('Title', { exact: true }).fill('Discard me');
		await asMember.getByRole('link', { name: 'Cancel' }).click();
		await expect(asMember).toHaveURL(new RegExp(`/notes/${N.einCommands.id}$`));
		await expect(asMember.getByRole('heading', { name: N.einCommands.title })).toBeVisible();

		await asMember.goto(`/${EIN}/notes/${N.einCommands.id}?edit=1`);
		await asMember.getByLabel('Title', { exact: true }).fill('Dirty title');
		await asMember.getByRole('link', { name: 'All notes' }).click();
		const dialog = asMember.getByRole('dialog');
		await expect(dialog).toContainText('unsaved changes');
		await dialog.getByRole('button', { name: 'Cancel' }).click();
		await expect(asMember).toHaveURL(/edit=1/);

		try {
			await asMember.getByLabel('Title', { exact: true }).fill(`${N.einCommands.title} (saved)`);
			await asMember.keyboard.press('ControlOrMeta+s');
			await expect(asMember).toHaveURL(new RegExp(`/notes/${N.einCommands.id}$`));
			await expect(
				asMember.getByRole('heading', { name: `${N.einCommands.title} (saved)`, exact: true })
			).toBeVisible();
		} finally {
			// Restore the seed title so other tests see the original, even if an assertion failed.
			await asMember.goto(`/${EIN}/notes/${N.einCommands.id}?edit=1`);
			await asMember.getByLabel('Title', { exact: true }).fill(N.einCommands.title);
			await asMember.keyboard.press('ControlOrMeta+s');
			await expect(asMember).toHaveURL(new RegExp(`/notes/${N.einCommands.id}$`));
			await expect(
				asMember.getByRole('heading', { name: N.einCommands.title, exact: true })
			).toBeVisible();
		}
	});

	test('tag input keeps invalid text and explains why', async ({ asMember }) => {
		await asMember.goto(`/${EIN}/notes/new`);
		const tagBox = asMember.getByRole('combobox');
		const long = 'x'.repeat(33);
		await tagBox.fill(long);
		await tagBox.press('Enter');
		await expect(tagBox).toHaveValue(long);
		await expect(tagBox).toHaveAttribute('aria-invalid', 'true');
		await expect(asMember.getByRole('alert')).toHaveText('Each tag must be 1 to 32 characters.');
		await expect(asMember.getByRole('button', { name: /^Remove tag/ })).toHaveCount(0);

		// Over-long text matches no suggestions instead of listing them all.
		await expect(asMember.getByRole('listbox')).toHaveCount(0);

		// Editing the text clears the message.
		await tagBox.press('Backspace');
		await expect(asMember.getByRole('alert')).toHaveCount(0);
		await expect(tagBox).not.toHaveAttribute('aria-invalid');
	});

	test('fixing leftover invalid tags does not commit them mid-edit', async ({ asMember }) => {
		await asMember.goto(`/${EIN}/notes/new`);
		const tagBox = asMember.getByRole('combobox');
		const chips = asMember.getByRole('button', { name: /^Remove tag/ });
		const x = 'x'.repeat(33);
		const y = 'y'.repeat(33);
		await tagBox.fill(`${x}, ${y}`);
		await expect(tagBox).toHaveValue(`${x}, ${y}`);
		await expect(asMember.getByRole('alert')).toHaveText('Each tag must be 1 to 32 characters.');

		// Shortening the second tag makes it valid, but typing must not commit it.
		await tagBox.press('End');
		await tagBox.press('Backspace');
		await expect(tagBox).toHaveValue(`${x}, ${y.slice(1)}`);
		await expect(chips).toHaveCount(0);

		// Enter commits the valid one and keeps the other with its reason.
		await tagBox.press('Enter');
		await expect(chips).toHaveCount(1);
		await expect(tagBox).toHaveValue(x);
		await expect(asMember.getByRole('alert')).toHaveText('Each tag must be 1 to 32 characters.');
	});

	test('tag input at the limit keeps focus and Backspace removes a chip', async ({ asMember }) => {
		await asMember.goto(`/${EIN}/notes/new`);
		const tagBox = asMember.getByRole('combobox');
		const chips = asMember.getByRole('button', { name: /^Remove tag/ });
		for (let i = 1; i <= 10; i++) {
			await tagBox.fill(`t${i}`);
			await tagBox.press('Enter');
		}
		await expect(chips).toHaveCount(10);
		await expect(tagBox).toBeFocused();
		await expect(tagBox).toHaveAttribute('aria-disabled', 'true');
		await expect(tagBox).toHaveAttribute('readonly', '');

		await asMember.keyboard.press('Backspace');
		await expect(chips).toHaveCount(9);
		await expect(asMember.getByRole('button', { name: 'Remove tag t10' })).toHaveCount(0);
		await expect(tagBox).toBeFocused();
		await expect(tagBox).not.toHaveAttribute('aria-disabled');

		// Pasting past the limit keeps the extra text with a reason.
		await tagBox.fill('t10, t11');
		await expect(chips).toHaveCount(10);
		await expect(tagBox).toHaveValue('t11');
		await expect(asMember.getByRole('alert')).toHaveText('Too many tags (max 10).');
	});

	test('without JavaScript a failed save keeps the editor and typed text', async ({
		app,
		browser
	}) => {
		const page = await noJsMember(app, browser);
		try {
			await page.goto(`/${EIN}/notes/${N.einCommands.id}?edit=1`);
			await page.getByLabel('Title', { exact: true }).fill('No-JS draft title');
			await page.locator('#note-body').fill('No-JS draft body');
			// The seed note is shared and not pinned; flip both.
			await page.getByLabel('Share with caretakers').uncheck();
			await page.getByLabel('Pin to top').check();
			const long = 'y'.repeat(33);
			await page.getByRole('combobox').fill(long);
			await page.getByRole('button', { name: 'Save', exact: true }).click();

			// Re-rendered at ?/update without edit=1: still the editor, with the draft.
			await expect(page).toHaveURL(/\?\/update$/);
			await expectTagError(page, long);
			await expect(page.getByLabel('Title', { exact: true })).toHaveValue('No-JS draft title');
			await expect(page.locator('#note-body')).toHaveValue('No-JS draft body');
			await expect(page.getByLabel('Share with caretakers')).not.toBeChecked();
			await expect(page.getByLabel('Pin to top')).toBeChecked();
			for (const tag of ['training', 'tricks']) {
				await expect(page.getByRole('button', { name: `Remove tag ${tag}` })).toBeVisible();
			}

			// Cancel is a plain link, so it works without JS too. Nothing was saved.
			await page.getByRole('link', { name: 'Cancel' }).click();
			await expect(page).toHaveURL(new RegExp(`/notes/${N.einCommands.id}$`));
			await expect(
				page.getByRole('heading', { name: N.einCommands.title, exact: true })
			).toBeVisible();
		} finally {
			await page.context().close();
		}
	});

	test('without JavaScript a failed create keeps the typed text', async ({ app, browser }) => {
		const page = await noJsMember(app, browser);
		try {
			await page.goto(`/${EIN}/notes/new`);
			await page.getByLabel('Title', { exact: true }).fill('No-JS new note');
			await page.locator('#note-body').fill('No-JS new body');
			const long = 'z'.repeat(33);
			await page.getByRole('combobox').fill(`food, ${long}`);
			await page.getByRole('button', { name: 'Save', exact: true }).click();

			await expect(page).toHaveURL(/\/notes\/new\?\/create$/);
			await expectTagError(page, `food, ${long}`);
			await expect(page.getByLabel('Title', { exact: true })).toHaveValue('No-JS new note');
			await expect(page.locator('#note-body')).toHaveValue('No-JS new body');

			// Nothing was created.
			await page.goto(`/${EIN}/notes`);
			await expect(page.getByRole('link', { name: 'No-JS new note' })).toHaveCount(0);
		} finally {
			await page.context().close();
		}
	});

	test('closing the tab with unsaved changes triggers the browser prompt', async ({ asMember }) => {
		await asMember.goto(`/${EIN}/notes/new`);
		await asMember.getByLabel('Title', { exact: true }).fill('Unsaved');
		let prompted = false;
		asMember.once('dialog', async (d) => {
			prompted = d.type() === 'beforeunload';
			await d.dismiss();
		});
		await asMember.close({ runBeforeUnload: true });
		await expect.poll(() => prompted).toBe(true);
	});

	test('stale tag link shows a clear-filter empty state', async ({ asMember }) => {
		await asMember.goto(`/${EIN}/notes?tag=no-such-tag`);
		await expect(asMember.getByText('No notes with this tag')).toBeVisible();
		await asMember.getByRole('link', { name: 'Clear filter' }).click();
		await expect(asMember.getByRole('link', { name: N.einSitter.title })).toBeVisible();
	});

	test('search finds a note by tag', async ({ asMember }) => {
		await asMember.goto(`/${EIN}`);
		// The search button proves the layout hydrated, so Ctrl+K won't race mount.
		await expect(asMember.getByRole('button', { name: 'Open search' })).toBeVisible({
			timeout: 8_000
		});
		await asMember.evaluate(() => document.body.focus());
		await asMember.keyboard.press('Control+k');
		const dialog = asMember.locator('[role="dialog"]');
		await expect(dialog).toBeVisible({ timeout: 8_000 });
		await asMember.keyboard.type('tricks');
		await dialog.locator('[role="option"]').filter({ hasText: N.einCommands.title }).click();
		await expect(asMember).toHaveURL(new RegExp(`/${EIN}/notes/${N.einCommands.id}$`));
	});

	test('media: upload, lightbox, caption, delete; deleting the note removes it', async ({
		asMember
	}) => {
		let noteUrl: string | null = null;
		try {
			noteUrl = await createScratchNote(asMember, 'E2E Media note');
			await waitForHydration(asMember);
			const imgs = asMember.locator('img[src*="/api/photos/notes/"]');
			const input = asMember.locator('input[type="file"][name="photos"]').first();

			await input.setInputFiles(pngUpload('first.png'));
			await expect(imgs.first()).toBeVisible({ timeout: 15_000 });

			// The thumbnail opens the lightbox; Escape closes it.
			await imgs.first().click();
			const lightbox = asMember.locator('[role="dialog"][aria-modal="true"]');
			await expect(lightbox).toBeVisible({ timeout: 5_000 });
			await asMember.keyboard.press('Escape');
			await expect(lightbox).toHaveCount(0);

			// Caption edit persists.
			await asMember.getByRole('button', { name: 'Edit Caption' }).first().click();
			await asMember.locator('textarea[name="photo-notes"]').first().fill('e2e note caption');
			await asMember.getByRole('button', { name: 'Save', exact: true }).first().click();
			await expect(asMember.getByText('e2e note caption')).toBeVisible({ timeout: 5_000 });
			await asMember.reload();
			await expect(asMember.getByText('e2e note caption')).toBeVisible({ timeout: 5_000 });

			// Delete asks for confirmation.
			await waitForHydration(asMember);
			const tile = asMember
				.locator('div.group')
				.filter({ has: asMember.locator('img[src*="/api/photos/notes/"]') })
				.first();
			await tile.hover();
			await tile.getByRole('button', { name: 'Delete media' }).click();
			await asMember.getByRole('dialog').getByRole('button', { name: 'Delete' }).click();
			await expect(imgs).toHaveCount(0, { timeout: 5_000 });

			// Upload again, then delete the whole note: its media URL goes with it.
			await input.setInputFiles(pngUpload('second.png'));
			await expect(imgs.first()).toBeVisible({ timeout: 15_000 });
			const src = await imgs.first().getAttribute('src');
			expect(src).toBeTruthy();
			expect((await asMember.request.get(src!)).status()).toBe(200);
			await deleteNoteAt(asMember, noteUrl);
			noteUrl = null;
			expect((await asMember.request.get(src!)).status()).toBe(404);
		} finally {
			if (noteUrl) await deleteNoteAt(asMember, noteUrl);
		}
	});

	test('media: a video upload is stored as-is and listed', async ({ asMember }) => {
		let noteUrl: string | null = null;
		try {
			noteUrl = await createScratchNote(asMember, 'E2E Video note');
			const noteId = new URL(noteUrl).pathname.split('/').pop()!;
			await waitForHydration(asMember);
			await asMember
				.locator('input[type="file"][name="photos"]')
				.first()
				.setInputFiles(mp4Upload());

			// The signature-only buffer can't be decoded, so JournalVideo may swap the
			// player for its download link. Either element carries the media URL.
			await expect(
				asMember.locator('video[src*="/api/photos/notes/"], a[href*="/api/photos/notes/"]').first()
			).toBeAttached({ timeout: 15_000 });

			const res = await asMember.request.get(`/api/companions/${EIN}/notes/${noteId}/media`);
			expect(res.status()).toBe(200);
			const { media } = await res.json();
			expect(media).toHaveLength(1);
			expect(media[0].filename).toMatch(/\.mp4$/);
			expect(media[0].status).toBe('ready');
		} finally {
			if (noteUrl) await deleteNoteAt(asMember, noteUrl);
		}
	});

	test('media strip: hint before the first save, hidden while editing, shown on view', async ({
		asMember
	}) => {
		await asMember.goto(`/${EIN}/notes/new`);
		await expect(asMember.getByText(MEDIA_HINT)).toBeVisible();
		await expect(asMember.locator('input[type="file"][name="photos"]')).toHaveCount(0);

		await asMember.goto(`/${EIN}/notes/${N.einCommands.id}?edit=1`);
		await expect(asMember.getByLabel('Title', { exact: true })).toBeVisible();
		await expect(asMember.getByText(MEDIA_HINT)).toHaveCount(0);
		await expect(asMember.locator('input[type="file"][name="photos"]')).toHaveCount(0);

		await asMember.goto(`/${EIN}/notes/${N.einCommands.id}`);
		await expect(
			asMember.locator(
				`img[src*="/api/photos/notes/${EIN}/${N.einCommands.id}/${M.einCommands.filename}"]`
			)
		).toBeVisible({ timeout: 10_000 });
		await expect(asMember.getByText(M.einCommands.caption)).toBeVisible();
	});

	test('header Notes icon on mobile @mobile', async ({ asMember }, testInfo) => {
		test.skip(testInfo.project.name !== 'mobile', 'header icons are mobile-only');
		await asMember.goto(`/${EIN}`);
		const icon = asMember.getByRole('link', { name: 'Notes', exact: true });
		await icon.click();
		await expect(asMember).toHaveURL(new RegExp(`/${EIN}/notes$`));
		await expect(icon).toHaveAttribute('aria-current', 'page');

		// The switcher flexes to fill the bar; the icon must not paint over it.
		const iconBox = await icon.boundingBox();
		const switcherBox = await asMember
			.getByRole('button', { name: 'Switch companion' })
			.boundingBox();
		expect(iconBox).toBeTruthy();
		expect(switcherBox).toBeTruthy();
		const separated =
			iconBox!.x + iconBox!.width <= switcherBox!.x ||
			switcherBox!.x + switcherBox!.width <= iconBox!.x ||
			iconBox!.y + iconBox!.height <= switcherBox!.y ||
			switcherBox!.y + switcherBox!.height <= iconBox!.y;
		expect(separated, 'header Notes icon must not overlap the companion switcher').toBe(true);
	});
});

test.describe('notes (caretaker)', () => {
	test('shared note summary shows the media count while collapsed', async ({ asCaretaker }) => {
		await asCaretaker.goto(`/care/${EIN}`);
		const summary = asCaretaker
			.locator('details > summary')
			.filter({ hasText: N.einCommands.title });
		await expect(summary.getByTestId('note-media-count')).toHaveText('1');
	});

	test('sees shared notes, not private ones', async ({ asCaretaker }) => {
		await asCaretaker.goto(`/care/${EIN}`);
		await expect(asCaretaker.getByText(N.einSitter.title, { exact: true })).toBeVisible();
		await expect(asCaretaker.getByText(N.einCommands.title, { exact: true })).toBeVisible();
		await expect(asCaretaker.getByText(N.einPrivate.title, { exact: true })).toHaveCount(0);
	});

	test('shared note media opens in the lightbox; private and unassigned media are blocked', async ({
		asCaretaker
	}) => {
		await asCaretaker.goto(`/care/${EIN}`);
		await waitForHydration(asCaretaker);

		// Only the first <details> starts open, and the pinned sitter note sorts first.
		const commands = asCaretaker.locator('details').filter({ hasText: N.einCommands.title });
		await commands.locator('summary').click();
		const thumb = commands.locator(
			`img[src*="/api/photos/notes/${EIN}/${N.einCommands.id}/${M.einCommands.filename}"]`
		);
		await expect(thumb).toBeVisible({ timeout: 10_000 });
		await thumb.click();
		const lightbox = asCaretaker.locator('[role="dialog"][aria-modal="true"]');
		await expect(lightbox).toBeVisible({ timeout: 5_000 });
		await expect(lightbox).toContainText(M.einCommands.caption);
		await asCaretaker.keyboard.press('Escape');
		await expect(lightbox).toHaveCount(0);

		// No media from the private note reaches the page.
		await expect(asCaretaker.locator(`img[src*="/${N.einPrivate.id}/"]`)).toHaveCount(0);

		const shared = await asCaretaker.request.get(
			`/api/photos/notes/${EIN}/${N.einCommands.id}/${M.einCommands.filename}`
		);
		expect(shared.status()).toBe(200);
		const unshared = await asCaretaker.request.get(
			`/api/photos/notes/${EIN}/${N.einPrivate.id}/${M.einPrivate.filename}`
		);
		expect(unshared.status()).toBe(404);
		const unassigned = await asCaretaker.request.get(
			`/api/photos/notes/${EDWARD}/${N.edwardSitter.id}/${M.edwardSitter.filename}`
		);
		expect(unassigned.status()).toBe(403);
	});

	test('unassigned companion is a 403', async ({ asCaretaker }) => {
		await asCaretaker.goto(`/care/${EDWARD}`);
		await expect(asCaretaker.getByText(/403|not assigned/i)).toBeVisible();
	});

	test('owner notes pages redirect to /care', async ({ asCaretaker }) => {
		await asCaretaker.goto(`/${EIN}/notes`);
		await expect(asCaretaker).toHaveURL(/\/care/);
	});

	test('form actions reject caretakers', async ({ asCaretaker, app }) => {
		// The owner route guard in hooks rejects these before the action runs.
		const FORBIDDEN = { status: 403, body: { type: 'error', error: { message: 'Forbidden' } } };
		const base = app.server.baseURL;
		const update = await postAction(asCaretaker, base, `/${EIN}/notes/${N.einSitter.id}?/update`, {
			title: 'hijacked',
			body: ''
		});
		expect(update).toEqual(FORBIDDEN);
		const create = await postAction(asCaretaker, base, `/${EIN}/notes/new?/create`, {
			title: 'sneaky'
		});
		expect(create).toEqual(FORBIDDEN);

		await asCaretaker.goto(`/care/${EIN}`);
		await expect(asCaretaker.getByText(N.einSitter.title, { exact: true })).toBeVisible();
		await expect(asCaretaker.getByText('hijacked')).toHaveCount(0);
	});
});

// Per-test servers for env variants: never mutate the shared worker DB.
type World = { server: AppServer };

function worldTest(prepare: (dir: string) => string, label: string) {
	return base.extend<{ world: World }>({
		// eslint-disable-next-line no-empty-pattern
		world: async ({}, use, testInfo) => {
			const dir = path.join(
				REPO_ROOT,
				'.test-data',
				`notes-${label}-${testInfo.workerIndex}-${testInfo.testId}`
			);
			const dbPath = prepare(dir);
			let server: AppServer;
			try {
				server = await startAppServer({ dbPath, env: { PORT: String(await getFreePort()) } });
			} catch (err) {
				fs.rmSync(dir, { recursive: true, force: true });
				throw err;
			}
			await use({ server });
			await server.stop();
			fs.rmSync(dir, { recursive: true, force: true });
		}
	});
}

// Returns the logged-in page; callers close it with `page.context().close()`.
async function login(
	world: World,
	browser: import('@playwright/test').Browser,
	user: { username: string }
) {
	const ctx = await browser.newContext({ baseURL: world.server.baseURL });
	const page = await ctx.newPage();
	await page.goto('/auth/login');
	await page.getByLabel('Username').fill(user.username);
	await page.getByLabel('Password', { exact: true }).fill(SEED.password);
	await page.getByRole('button', { name: 'Sign in' }).click();
	await expect(page.getByLabel('Username')).toHaveCount(0, { timeout: 10_000 });
	return page;
}

const offShift = worldTest((dir) => createSeededDbNoShift(dir), 'offshift');
offShift('off-shift caretaker still sees shared notes', async ({ world, browser }) => {
	test.slow();
	const page = await login(world, browser, SEED.caretaker);
	try {
		await page.goto(`/care/${EIN}`);
		await expect(page.getByText(N.einSitter.title, { exact: true })).toBeVisible();
		await expect(page.getByText(N.einPrivate.title, { exact: true })).toHaveCount(0);
		// Shared note media follows the note: readable off shift too.
		const media = await page.request.get(
			`/api/photos/notes/${EIN}/${N.einCommands.id}/${M.einCommands.filename}`
		);
		expect(media.status()).toBe(200);
	} finally {
		await page.context().close();
	}
});

const archived = worldTest((dir) => {
	const dbPath = createSeededDb(dir);
	const sqlite = new Database(dbPath);
	sqlite.prepare('UPDATE companions SET is_active = 0 WHERE id = ?').run(JULIA);
	sqlite.close();
	return dbPath;
}, 'archived');
archived('API hides notes on archived companions', async ({ world, browser }) => {
	test.slow();
	const page = await login(world, browser, SEED.member);
	try {
		const raw = await createToken(page, 'Archived probe');
		const res = await page.request.get(`${world.server.baseURL}/api/notes/${N.juliaSitter.id}`, {
			headers: { Authorization: `Bearer ${raw}` }
		});
		expect(res.status()).toBe(404);
	} finally {
		await page.context().close();
	}
});

archived(
	'owners add media on archived companions; caretakers get 404',
	async ({ world, browser }) => {
		test.slow();
		const member = await login(world, browser, SEED.member);
		const caretaker = await login(world, browser, SEED.caretaker);
		try {
			const base = world.server.baseURL;
			const res = await member.request.post(
				`${base}/api/companions/${JULIA}/notes/${N.juliaSitter.id}/media`,
				{ headers: { Origin: base }, multipart: { file: pngUpload() } }
			);
			expect(res.ok()).toBe(true);
			const { url } = await res.json();
			expect(url).toContain(`/api/photos/notes/${JULIA}/${N.juliaSitter.id}/`);
			expect((await member.request.get(base + url)).status()).toBe(200);
			// Faye is assigned to Julia, but an archived companion hides its shared notes.
			expect((await caretaker.request.get(base + url)).status()).toBe(404);
		} finally {
			await member.context().close();
			await caretaker.context().close();
		}
	}
);

// Bearer calls are rate limited per IP per server process, so the API specs get
// their own server instead of spending the shared worker server's budget.
const apiWorld = worldTest((dir) => createSeededDb(dir), 'api');

apiWorld(
	'notes API: CRUD, idempotent create, and the companion alias',
	async ({ world, browser }) => {
		test.slow();
		const page = await login(world, browser, SEED.member);
		try {
			const raw = await createToken(page, 'Notes bot');
			const api = (p: string) => world.server.baseURL + p;
			const auth = { Authorization: `Bearer ${raw}` };

			const headers = { ...auth, 'Idempotency-Key': 'note-e2e-1' };
			const data = { companionId: EIN, title: 'API note', body: 'via api', tags: ['API'] };
			const first = await page.request.post(api('/api/notes'), { headers, data });
			expect(first.status()).toBe(201);
			const { id } = await first.json();
			const replay = await page.request.post(api('/api/notes'), { headers, data });
			expect(await replay.json()).toEqual({ id, companionId: EIN });

			const got = await page.request.get(api(`/api/notes/${id}`), { headers: auth });
			expect(await got.json()).toMatchObject({ title: 'API note', tags: ['api'], pinned: false });

			const list = await page.request.get(api(`/api/notes?companionId=${EIN}&tag=api`), {
				headers: auth
			});
			expect((await list.json()).notes.map((n: { id: string }) => n.id)).toEqual([id]);

			// A tag that can't exist still has its pagination checked.
			const badPage = await page.request.get(
				api(`/api/notes?companionId=${EIN}&tag=${'x'.repeat(33)}&limit=abc`),
				{ headers: auth }
			);
			expect(badPage.status()).toBe(400);
			expect((await badPage.json()).code).toBe('invalidPagination');
			const badPinned = await page.request.get(api(`/api/notes?companionId=${EIN}&pinned=yes`), {
				headers: auth
			});
			expect(badPinned.status()).toBe(400);
			expect(await badPinned.json()).toMatchObject({
				code: 'invalidPinned',
				message: 'pinned must be "true" or "false".'
			});

			const patched = await page.request.patch(api(`/api/notes/${id}`), {
				headers: auth,
				data: { pinned: true, tags: [] }
			});
			expect(await patched.json()).toMatchObject({ pinned: true, tags: [] });

			const bad = await page.request.post(api('/api/notes'), {
				headers: auth,
				data: { companionId: EIN, title: '  ' }
			});
			expect(bad.status()).toBe(400);
			expect((await bad.json()).code).toBe('titleRequired');

			// Length is counted after trimming, as in the form.
			const padded = await page.request.patch(api(`/api/notes/${id}`), {
				headers: auth,
				data: { title: `${'t'.repeat(200)} ` }
			});
			expect(padded.status()).toBe(200);
			expect((await padded.json()).title).toBe('t'.repeat(200));

			const del = await page.request.delete(api(`/api/notes/${id}`), { headers: auth });
			expect(del.status()).toBe(204);
			const gone = await page.request.get(api(`/api/notes/${id}`), { headers: auth });
			expect(gone.status()).toBe(404);

			const companion = await page.request.get(api(`/api/companions/${EIN}`), { headers: auth });
			const alias = (await companion.json()).companion.notesForSitter as string;
			expect(alias).toContain(`## ${N.einSitter.title}`);
			expect(alias).not.toContain(N.einPrivate.title);
		} finally {
			await page.context().close();
		}
	}
);

apiWorld('notes API: write-scope and caretaker tokens get 403', async ({ world, browser }) => {
	test.slow();
	const member = await login(world, browser, SEED.member);
	const caretaker = await login(world, browser, SEED.caretaker);
	try {
		const api = (p: string) => world.server.baseURL + p;
		const valid = { companionId: EIN, title: 'nope' };

		const writeToken = await createToken(member, 'Notes write', '/settings', 'write');
		const w = await member.request.post(api('/api/notes'), {
			headers: { Authorization: `Bearer ${writeToken}` },
			data: valid
		});
		expect(w.status()).toBe(403);

		const careToken = await createToken(caretaker, 'Care notes', '/care/settings');
		const c = await caretaker.request.get(api(`/api/notes?companionId=${EIN}`), {
			headers: { Authorization: `Bearer ${careToken}` }
		});
		expect(c.status()).toBe(403);
		expect((await c.json()).code).toBe('forbidden');

		// The deprecated alias still serves shared notes to an assigned caretaker.
		const comp = await caretaker.request.get(api(`/api/companions/${EIN}`), {
			headers: { Authorization: `Bearer ${careToken}` }
		});
		expect((await comp.json()).companion.notesForSitter).toContain(N.einSitter.title);
	} finally {
		await member.context().close();
		await caretaker.context().close();
	}
});
