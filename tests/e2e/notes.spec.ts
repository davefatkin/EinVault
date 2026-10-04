import { test as base, type Page } from '@playwright/test';
import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import { test, expect } from '../lib/fixtures';
import { createSeededDb, createSeededDbNoShift, SEED } from '../lib/seed';
import { startAppServer, type AppServer } from '../lib/app-server';
import { getFreePort } from '../lib/ports';
import { createToken } from '../lib/api-tokens';

const EIN = SEED.companions.ein.id;
const JULIA = SEED.companions.julia.id;
const EDWARD = SEED.companions.edward.id;
const N = SEED.notes;
const REPO_ROOT = path.resolve(import.meta.dirname, '../..');

// Force SvelteKit's JSON action response so fail() status lands in the body.
async function postAction(page: Page, baseURL: string, url: string, form: Record<string, string>) {
	const res = await page.request.post(url, {
		headers: { Origin: baseURL, Accept: 'application/json' },
		form
	});
	return res.json();
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

test.describe('notes (owner)', () => {
	test('create with tags, filter, edit away a tag, pin, delete', async ({ asMember }) => {
		await fillNewNote(asMember, 'E2E Favorite foods', 'Loves *pumpkin*', ['Food', 'treats']);
		await asMember.getByRole('button', { name: 'Save', exact: true }).click();
		await expect(asMember).toHaveURL(new RegExp(`/${EIN}/notes/[^/?]+$`));
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

		// Pin moves it to the top and is not an edit.
		const card = asMember.locator('article').filter({ hasText: 'E2E Favorite foods' });
		await card.getByRole('button', { name: 'Pin' }).click();
		await expect(asMember.locator('article').first()).toContainText('E2E Favorite foods');
		await expect(card).not.toContainText('edited by');

		// Delete.
		await asMember.goto(noteUrl);
		await asMember.getByRole('button', { name: 'Delete note' }).click();
		await asMember.getByRole('dialog').getByRole('button', { name: 'Delete' }).click();
		await expect(asMember).toHaveURL(new RegExp(`/${EIN}/notes$`));
		await expect(asMember.getByRole('link', { name: 'E2E Favorite foods' })).toHaveCount(0);
	});

	test('pasted comma-separated tags and turning sharing off', async ({ asMember }) => {
		await fillNewNote(asMember, 'E2E Paste tags', '', []);
		await asMember.getByRole('combobox').fill('one, two, three');
		await asMember.getByLabel('Share with caretakers').check();
		await asMember.getByRole('button', { name: 'Save', exact: true }).click();
		for (const tag of ['one', 'two', 'three']) {
			await expect(asMember.getByRole('link', { name: tag, exact: true })).toBeVisible();
		}
		await expect(asMember.getByText('Shared', { exact: true })).toBeVisible();

		await asMember.goto(`${asMember.url()}?edit=1`);
		await asMember.getByLabel('Share with caretakers').uncheck();
		for (const tag of ['one', 'two', 'three']) {
			await asMember.getByRole('button', { name: `Remove tag ${tag}` }).click();
		}
		await asMember.getByRole('button', { name: 'Save', exact: true }).click();
		await expect(asMember.getByText('Shared', { exact: true })).toHaveCount(0);
		await expect(asMember.getByRole('link', { name: 'one', exact: true })).toHaveCount(0);
	});

	test('editor: cancel discards, dirty navigation asks, Ctrl+S saves', async ({ asMember }) => {
		await asMember.goto(`/${EIN}/notes/${N.einCommands.id}?edit=1`);
		await asMember.getByLabel('Title', { exact: true }).fill('Discard me');
		await asMember.getByRole('button', { name: 'Cancel' }).click();
		await expect(asMember).toHaveURL(new RegExp(`/notes/${N.einCommands.id}$`));
		await expect(asMember.getByRole('heading', { name: N.einCommands.title })).toBeVisible();

		await asMember.goto(`/${EIN}/notes/${N.einCommands.id}?edit=1`);
		await asMember.getByLabel('Title', { exact: true }).fill('Dirty title');
		await asMember.getByRole('link', { name: 'All notes' }).click();
		const dialog = asMember.getByRole('dialog');
		await expect(dialog).toContainText('unsaved changes');
		await dialog.getByRole('button', { name: 'Cancel' }).click();
		await expect(asMember).toHaveURL(/edit=1/);

		await asMember.getByLabel('Title', { exact: true }).fill(`${N.einCommands.title} (saved)`);
		await asMember.keyboard.press('ControlOrMeta+s');
		await expect(asMember).toHaveURL(new RegExp(`/notes/${N.einCommands.id}$`));
		await expect(
			asMember.getByRole('heading', { name: `${N.einCommands.title} (saved)` })
		).toBeVisible();

		// Restore the seed title so other tests see the original.
		await asMember.goto(`/${EIN}/notes/${N.einCommands.id}?edit=1`);
		await asMember.getByLabel('Title', { exact: true }).fill(N.einCommands.title);
		await asMember.keyboard.press('ControlOrMeta+s');
		await expect(asMember.getByRole('heading', { name: N.einCommands.title })).toBeVisible();
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

	test('header Notes icon on mobile @mobile', async ({ asMember }, testInfo) => {
		test.skip(testInfo.project.name !== 'mobile', 'header icons are mobile-only');
		await asMember.goto(`/${EIN}`);
		const icon = asMember.getByRole('link', { name: 'Notes', exact: true });
		await icon.click();
		await expect(asMember).toHaveURL(new RegExp(`/${EIN}/notes$`));
		await expect(icon).toHaveAttribute('aria-current', 'page');
	});
});

test.describe('notes (caretaker)', () => {
	test('sees shared notes, not private ones', async ({ asCaretaker }) => {
		await asCaretaker.goto(`/care/${EIN}`);
		await expect(asCaretaker.getByText(N.einSitter.title, { exact: true })).toBeVisible();
		await expect(asCaretaker.getByText(N.einCommands.title, { exact: true })).toBeVisible();
		await expect(asCaretaker.getByText(N.einPrivate.title, { exact: true })).toHaveCount(0);
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
		const base = app.server.baseURL;
		const update = await postAction(asCaretaker, base, `/${EIN}/notes/${N.einSitter.id}?/update`, {
			title: 'hijacked',
			body: ''
		});
		expect(update).toMatchObject({ type: 'failure', status: 403 });
		const create = await postAction(asCaretaker, base, `/${EIN}/notes/new?/create`, {
			title: 'sneaky'
		});
		expect(create).toMatchObject({ type: 'failure', status: 403 });

		await asCaretaker.goto(`/care/${EIN}`);
		await expect(asCaretaker.getByText(N.einSitter.title, { exact: true })).toBeVisible();
		await expect(asCaretaker.getByText('hijacked')).toHaveCount(0);
	});
});

test.describe('notes API', () => {
	test('CRUD, idempotent create, and the companion alias', async ({ asMember, app }) => {
		const raw = await createToken(asMember, 'Notes bot');
		const api = (p: string) => app.server.baseURL + p;
		const auth = { Authorization: `Bearer ${raw}` };

		const headers = { ...auth, 'Idempotency-Key': 'note-e2e-1' };
		const data = { companionId: EIN, title: 'API note', body: 'via api', tags: ['API'] };
		const first = await asMember.request.post(api('/api/notes'), { headers, data });
		expect(first.status()).toBe(201);
		const { id } = await first.json();
		const replay = await asMember.request.post(api('/api/notes'), { headers, data });
		expect(await replay.json()).toEqual({ id, companionId: EIN });

		const got = await asMember.request.get(api(`/api/notes/${id}`), { headers: auth });
		expect(await got.json()).toMatchObject({ title: 'API note', tags: ['api'], pinned: false });

		const list = await asMember.request.get(api(`/api/notes?companionId=${EIN}&tag=api`), {
			headers: auth
		});
		expect((await list.json()).notes.map((n: { id: string }) => n.id)).toEqual([id]);

		const patched = await asMember.request.patch(api(`/api/notes/${id}`), {
			headers: auth,
			data: { pinned: true, tags: [] }
		});
		expect(await patched.json()).toMatchObject({ pinned: true, tags: [] });

		const bad = await asMember.request.post(api('/api/notes'), {
			headers: auth,
			data: { companionId: EIN, title: '  ' }
		});
		expect(bad.status()).toBe(400);
		expect((await bad.json()).code).toBe('titleRequired');

		const del = await asMember.request.delete(api(`/api/notes/${id}`), { headers: auth });
		expect(del.status()).toBe(204);
		const gone = await asMember.request.get(api(`/api/notes/${id}`), { headers: auth });
		expect(gone.status()).toBe(404);

		const companion = await asMember.request.get(api(`/api/companions/${EIN}`), { headers: auth });
		const alias = (await companion.json()).companion.notesForSitter as string;
		expect(alias).toContain(`## ${N.einSitter.title}`);
		expect(alias).not.toContain(N.einPrivate.title);
	});

	test('write-scope and caretaker tokens get 403', async ({ asMember, asCaretaker, app }) => {
		const api = (p: string) => app.server.baseURL + p;
		const valid = { companionId: EIN, title: 'nope' };

		const writeToken = await createToken(asMember, 'Notes write', '/settings', 'write');
		const w = await asMember.request.post(api('/api/notes'), {
			headers: { Authorization: `Bearer ${writeToken}` },
			data: valid
		});
		expect(w.status()).toBe(403);

		const careToken = await createToken(asCaretaker, 'Care notes', '/care/settings');
		const c = await asCaretaker.request.get(api(`/api/notes?companionId=${EIN}`), {
			headers: { Authorization: `Bearer ${careToken}` }
		});
		expect(c.status()).toBe(403);
		expect((await c.json()).code).toBe('forbidden');

		// The deprecated alias still serves shared notes to an assigned caretaker.
		const comp = await asCaretaker.request.get(api(`/api/companions/${EIN}`), {
			headers: { Authorization: `Bearer ${careToken}` }
		});
		expect((await comp.json()).companion.notesForSitter).toContain(N.einSitter.title);
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
	const page = await login(world, browser, SEED.caretaker);
	await page.goto(`/care/${EIN}`);
	await expect(page.getByText(N.einSitter.title, { exact: true })).toBeVisible();
	await expect(page.getByText(N.einPrivate.title, { exact: true })).toHaveCount(0);
});

const archived = worldTest((dir) => {
	const dbPath = createSeededDb(dir);
	const sqlite = new Database(dbPath);
	sqlite.prepare('UPDATE companions SET is_active = 0 WHERE id = ?').run(JULIA);
	sqlite.close();
	return dbPath;
}, 'archived');
archived('API hides notes on archived companions', async ({ world, browser }) => {
	const page = await login(world, browser, SEED.member);
	const raw = await createToken(page, 'Archived probe');
	const res = await page.request.get(`${world.server.baseURL}/api/notes/${N.juliaSitter.id}`, {
		headers: { Authorization: `Bearer ${raw}` }
	});
	expect(res.status()).toBe(404);
});
