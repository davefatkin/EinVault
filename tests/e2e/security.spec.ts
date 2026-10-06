import { test, expect } from '../lib/fixtures';
import { SEED } from '../lib/seed';
import { pngUpload } from '../lib/files';
import { todayUTC } from '../lib/dates';
import { waitForHydration } from '../lib/hydration';

const EIN = SEED.companions.ein.id;
const EDWARD = SEED.companions.edward.id;
const JULIA = SEED.companions.julia.id;

test.describe('security headers', () => {
	test('page response carries required security headers', async ({ app, browser }) => {
		const ctx = await browser.newContext({ baseURL: app.server.baseURL });
		const res = await ctx.request.get('/auth/login');
		expect(res.status()).toBe(200);

		const headers = res.headers();
		expect(headers['x-frame-options']).toBe('DENY');
		expect(headers['x-content-type-options']).toBe('nosniff');
		expect(headers['referrer-policy']).toBe('strict-origin-when-cross-origin');
		expect(headers['permissions-policy']).toContain('camera=()');
		expect(headers['content-security-policy'] ?? '').toBeTruthy();
		// Test server runs NODE_ENV=production so HSTS must be present
		expect(headers['strict-transport-security'] ?? '').toContain('max-age=');

		await ctx.close();
	});
});

test.describe('api authz', () => {
	test('health endpoint is public', async ({ app, browser }) => {
		const ctx = await browser.newContext({ baseURL: app.server.baseURL });
		const res = await ctx.request.get('/api/health');
		expect(res.status()).toBe(200);
		await ctx.close();
	});

	test('caretaker cannot access immich assets (role check before config)', async ({
		asCaretaker
	}) => {
		// Handler checks role === 'caretaker' → 403 before checking IMMICH_CONFIG
		const res = await asCaretaker.request.get('/api/immich/assets');
		expect(res.status()).toBe(403);
	});

	test('caretaker cannot access paperless documents (role check before config)', async ({
		asCaretaker
	}) => {
		// Handler checks role === 'caretaker' → 403 before checking PAPERLESS_CONFIG
		const res = await asCaretaker.request.get('/api/paperless/documents');
		expect(res.status()).toBe(403);
	});

	test('caretaker cannot access companion documents', async ({ asCaretaker }) => {
		const res = await asCaretaker.request.get(`/api/companions/${EIN}/documents`);
		expect(res.status()).toBe(403);
	});

	test('caretaker cannot read a photo for an unassigned companion', async ({
		asMember,
		asCaretaker
	}) => {
		// Upload a photo to Edward (caretaker is only assigned to Ein)
		await asMember.goto(`/${EDWARD}/journal/2026-06-03`);
		await waitForHydration(asMember);
		const fileInput = asMember.locator('input[type="file"][name="photos"]').first();
		await fileInput.setInputFiles(pngUpload());

		const photoImg = asMember.locator('img[src*="/api/photos/journal/"]').first();
		await expect(photoImg).toBeVisible({ timeout: 15_000 });

		const src = await photoImg.getAttribute('src');
		expect(src).toBeTruthy();

		// asCaretaker is not assigned to Edward → 403
		const res = await asCaretaker.request.get(src!);
		expect(res.status()).toBe(403);
	});

	test('caretaker cannot upload a photo for an unassigned companion', async ({
		app,
		asCaretaker
	}) => {
		// Regression: POST used to skip the assignment check the GET enforces,
		// letting any caretaker write into any companion's journal.
		const res = await asCaretaker.request.post(
			`/api/companions/${EDWARD}/journal/${todayUTC()}/photos`,
			{
				headers: { Origin: app.server.baseURL }, // SvelteKit CSRF check
				multipart: { photo: pngUpload() }
			}
		);
		expect(res.status()).toBe(403);
	});

	test('assigned caretaker on shift can upload and delete a photo for today', async ({
		app,
		asCaretaker
	}) => {
		// Guard must not over-tighten: the caretaker is assigned to Julia and on shift.
		// Julia's entry for today is caretaker-authored in other specs too, and the
		// photo is deleted again so no media is left behind on a shared day.
		const base = `/api/companions/${JULIA}/journal/${todayUTC()}/photos`;
		const res = await asCaretaker.request.post(base, {
			headers: { Origin: app.server.baseURL },
			multipart: { photo: pngUpload() }
		});
		expect(res.status()).toBe(200);
		const { id } = await res.json();

		const del = await asCaretaker.request.delete(`${base}?photoId=${id}`, {
			headers: { Origin: app.server.baseURL }
		});
		expect(del.status()).toBe(200);
	});

	test('caretaker cannot upload a journal photo for another date (#319)', async ({
		app,
		asCaretaker
	}) => {
		// Caretakers write only today's journal; photo uploads follow the same rule.
		const res = await asCaretaker.request.post(`/api/companions/${EIN}/journal/2026-06-04/photos`, {
			headers: { Origin: app.server.baseURL },
			multipart: { photo: pngUpload() }
		});
		expect(res.status()).toBe(403);
	});

	test('caretaker cannot change or remove a companion avatar (#319)', async ({
		app,
		asCaretaker
	}) => {
		const post = await asCaretaker.request.post(`/api/companions/${EIN}/avatar`, {
			headers: { Origin: app.server.baseURL },
			multipart: { avatar: pngUpload() }
		});
		expect(post.status()).toBe(403);

		const del = await asCaretaker.request.delete(`/api/companions/${EIN}/avatar`, {
			headers: { Origin: app.server.baseURL }
		});
		expect(del.status()).toBe(403);
	});

	test('anonymous request to avatar endpoint returns 401', async ({ app, browser }) => {
		const ctx = await browser.newContext({ baseURL: app.server.baseURL });
		const res = await ctx.request.get(`/api/avatars/${EIN}`);
		// Handler: if (!locals.user) error(401, ...)
		expect(res.status()).toBe(401);
		await ctx.close();
	});

	test('caretaker cannot write note media (#321)', async ({ app, asCaretaker }) => {
		// /api/companions/* sits outside the guarded route groups; the endpoint's
		// own check is the only protection.
		const base = `/api/companions/${EIN}/notes/${SEED.notes.einCommands.id}/media`;
		const headers = { Origin: app.server.baseURL };
		const item = `?mediaId=${SEED.noteMedia.einCommands.id}`;

		const post = await asCaretaker.request.post(base, {
			headers,
			multipart: { file: pngUpload() }
		});
		expect(post.status()).toBe(403);
		const patch = await asCaretaker.request.patch(base + item, {
			headers,
			data: { caption: 'hijacked' }
		});
		expect(patch.status()).toBe(403);
		const del = await asCaretaker.request.delete(base + item, { headers });
		expect(del.status()).toBe(403);
		const immich = await asCaretaker.request.post(`${base}/from-immich`, {
			headers,
			data: { assetId: '00000000-0000-0000-0000-000000000001' }
		});
		expect(immich.status()).toBe(403);
		const poll = await asCaretaker.request.get(base);
		expect(poll.status()).toBe(403);
	});

	test('note media writes check the note against the URL (#321)', async ({ app, asMember }) => {
		const headers = { Origin: app.server.baseURL };
		const commands = SEED.notes.einCommands.id;

		// Ein's note under Edward's URL.
		const wrongCompanion = await asMember.request.post(
			`/api/companions/${EDWARD}/notes/${commands}/media`,
			{ headers, multipart: { file: pngUpload() } }
		);
		expect(wrongCompanion.status()).toBe(404);

		// A media id that belongs to another note.
		const foreign = SEED.noteMedia.einPrivate;
		const wrongNote = await asMember.request.delete(
			`/api/companions/${EIN}/notes/${commands}/media?mediaId=${foreign.id}`,
			{ headers }
		);
		expect(wrongNote.status()).toBe(404);
		const stillThere = await asMember.request.get(
			`/api/photos/notes/${EIN}/${foreign.noteId}/${foreign.filename}`
		);
		expect(stillThere.status()).toBe(200);
	});
});

// Form actions run before any load(), so layout role redirects never protect
// them. These POST straight to owner-route actions the way a crafted request
// would. A blocked request may come back as an HTTP error status or, for a
// fail() inside the action, as HTTP 200 with { type: 'failure', status }; either
// way the effective status must be the rejection, never a success.
async function postAction(
	request: import('@playwright/test').APIRequestContext,
	baseURL: string,
	path: string,
	form: Record<string, string> = {}
): Promise<number> {
	const res = await request.post(path, {
		headers: { Origin: baseURL, Accept: 'application/json' },
		form
	});
	if (res.status() !== 200) return res.status();
	const body = await res.json().catch(() => ({}));
	return body.type === 'failure' ? body.status : 200;
}

const OWNER_ACTIONS: { path: string; form?: Record<string, string> }[] = [
	{ path: `/${EIN}/health?/addHealth`, form: { title: 'caretaker forged', type: 'other' } },
	{ path: `/${EIN}/health?/addWeight`, form: { weight: '12', unit: 'lbs' } },
	{
		path: `/${EIN}/health?/updateHealth`,
		form: { id: 'no-such-event', title: 'x', type: 'other' }
	},
	{ path: `/${EIN}/health?/deleteHealth`, form: { id: 'no-such-event' } },
	{ path: `/${EIN}/health?/updateWeight`, form: { id: 'no-such-weight', weight: '1' } },
	{ path: `/${EIN}/health?/deleteWeight`, form: { id: 'no-such-weight' } },
	{
		path: `/${EIN}/reminders?/add`,
		form: { title: 'caretaker forged', type: 'other', dueAt: '2030-01-01T09:00' }
	},
	{ path: `/${EIN}/reminders?/update`, form: { id: 'no-such-reminder', title: 'x' } },
	{ path: `/${EIN}/reminders?/complete`, form: { id: 'no-such-reminder' } },
	{ path: `/${EIN}/reminders?/skip`, form: { id: 'no-such-reminder' } },
	{ path: `/${EIN}/reminders?/restore`, form: { id: 'no-such-reminder' } },
	{ path: `/${EIN}/reminders?/delete`, form: { id: 'no-such-reminder' } },
	{ path: `/${EIN}?/complete`, form: { id: 'no-such-reminder' } },
	{ path: `/${EIN}?/skip`, form: { id: 'no-such-reminder' } },
	{ path: `/${EIN}/journal/2020-01-01?/save`, form: { body: 'caretaker forged' } },
	{ path: `/${EIN}/log?/add`, form: { type: 'walk' } }
];

test.describe('owner form actions reject caretakers', () => {
	for (const { path, form } of OWNER_ACTIONS) {
		test(`caretaker POST ${path} is forbidden`, async ({ app, asCaretaker }) => {
			expect(await postAction(asCaretaker.request, app.server.baseURL, path, form)).toBe(403);
		});
	}

	// Same test (same worker DB) so the read-back sees what the forged writes did.
	test('caretaker forged writes leave no data behind', async ({ app, asCaretaker, asMember }) => {
		const base = app.server.baseURL;
		const title = 'caretaker forged write';
		await postAction(asCaretaker.request, base, `/${EIN}/health?/addHealth`, {
			title,
			type: 'other'
		});
		await postAction(asCaretaker.request, base, `/${EIN}/reminders?/add`, {
			title,
			type: 'other',
			dueAt: '2030-01-01T09:00'
		});
		await asMember.goto(`/${EIN}/health`);
		await expect(asMember.getByText(title)).toHaveCount(0);
		await asMember.goto(`/${EIN}/reminders`);
		await expect(asMember.getByText(title)).toHaveCount(0);
	});
});

test.describe('owner route guard responses', () => {
	const ADD_HEALTH = `/${EIN}/health?/addHealth`;

	// A plain 403 could also come from SvelteKit's CSRF origin check. The guard
	// answers enhanced (JSON) action requests with an ActionResult error, so
	// assert that shape to prove the guard is what rejected the request.
	test('guard rejection is an ActionResult error with security headers', async ({
		app,
		asCaretaker
	}) => {
		const res = await asCaretaker.request.post(ADD_HEALTH, {
			headers: { Origin: app.server.baseURL, Accept: 'application/json' },
			form: { title: 'x', type: 'other' }
		});
		expect(res.status()).toBe(403);
		expect(await res.json()).toEqual({ type: 'error', error: { message: 'Forbidden' } });
		expect(res.headers()['x-frame-options']).toBe('DENY');
	});

	test('unauthenticated owner action is 401', async ({ app, browser }) => {
		const ctx = await browser.newContext({ baseURL: app.server.baseURL });
		const res = await ctx.request.post(ADD_HEALTH, {
			headers: { Origin: app.server.baseURL, Accept: 'application/json' },
			form: { title: 'x', type: 'other' }
		});
		const body = await res.json();
		await ctx.close();
		expect(res.status()).toBe(401);
		expect(body.type).toBe('error');
	});

	test('unauthenticated non-JS post redirects to login', async ({ app, browser }) => {
		const ctx = await browser.newContext({ baseURL: app.server.baseURL });
		const res = await ctx.request.post(ADD_HEALTH, {
			headers: { Origin: app.server.baseURL, Accept: 'text/html' },
			form: { title: 'x', type: 'other' },
			maxRedirects: 0
		});
		await ctx.close();
		expect(res.status()).toBe(303);
		expect(res.headers()['location']).toBe('/auth/login');
	});
});

// Owners have no companion_caretakers row, so most care actions would fail()
// for them anyway. Asserting the guard's ActionResult error (HTTP 403, type
// 'error') rather than a failure proves the role check is what stopped them.
const CARE_ACTIONS: { path: string; form?: Record<string, string> }[] = [
	{ path: `/care/${EIN}?/complete`, form: { id: 'no-such-reminder' } },
	{ path: `/care/${EIN}?/skip`, form: { id: 'no-such-reminder' } },
	{ path: `/care/${EIN}?/executeQuickLog`, form: { id: 'no-such-quick-log' } },
	{ path: `/care/${EIN}/journal?/save`, form: { body: 'owner forged' } },
	{ path: `/care/${EIN}/log?/add`, form: { type: 'walk' } },
	{ path: `/care/${EIN}/log?/delete`, form: { id: 'no-such-event' } },
	{ path: '/care/settings?/theme', form: { theme: 'not-a-theme' } }
];

async function expectGuardForbidden(
	request: import('@playwright/test').APIRequestContext,
	baseURL: string,
	path: string,
	form?: Record<string, string>
) {
	const res = await request.post(path, {
		headers: { Origin: baseURL, Accept: 'application/json' },
		form
	});
	expect(res.status()).toBe(403);
	expect(await res.json()).toEqual({ type: 'error', error: { message: 'Forbidden' } });
}

test.describe('caretaker form actions reject owners', () => {
	for (const { path, form } of CARE_ACTIONS) {
		test(`member POST ${path} is forbidden`, async ({ app, asMember }) => {
			await expectGuardForbidden(asMember.request, app.server.baseURL, path, form);
		});
		test(`admin POST ${path} is forbidden`, async ({ app, asAdmin }) => {
			await expectGuardForbidden(asAdmin.request, app.server.baseURL, path, form);
		});
	}

	test('unauthenticated caretaker action is 401', async ({ app, browser }) => {
		const ctx = await browser.newContext({ baseURL: app.server.baseURL });
		const res = await ctx.request.post(`/care/${EIN}/log?/add`, {
			headers: { Origin: app.server.baseURL, Accept: 'application/json' },
			form: { type: 'walk' }
		});
		const body = await res.json();
		await ctx.close();
		expect(res.status()).toBe(401);
		expect(body.type).toBe('error');
	});
});

test.describe('owner-only API reads reject caretakers', () => {
	for (const companion of [EIN, EDWARD]) {
		test(`caretaker cannot page journal entries for ${companion}`, async ({ asCaretaker }) => {
			const res = await asCaretaker.request.get(`/api/companions/${companion}/journal/entries`);
			expect(res.status()).toBe(403);
		});
	}

	test('member can still page journal entries', async ({ asMember }) => {
		const res = await asMember.request.get(`/api/companions/${EIN}/journal/entries`);
		expect(res.status()).toBe(200);
		expect(Array.isArray((await res.json()).entries)).toBe(true);
	});
});

test.describe('admin form actions reject non-admins', () => {
	const RESTORE = '/admin/companions?/restore';

	test('member cannot restore a companion', async ({ app, asMember }) => {
		expect(
			await postAction(asMember.request, app.server.baseURL, RESTORE, {
				companionId: 'no-such-companion'
			})
		).toBe(403);
	});

	test('unauthenticated request cannot restore a companion', async ({ app, browser }) => {
		const ctx = await browser.newContext({ baseURL: app.server.baseURL });
		const status = await postAction(ctx.request, app.server.baseURL, RESTORE, {
			companionId: 'no-such-companion'
		});
		await ctx.close();
		expect(status).toBe(401);
	});

	test('caretaker cannot restore a companion', async ({ app, asCaretaker }) => {
		expect(
			await postAction(asCaretaker.request, app.server.baseURL, RESTORE, {
				companionId: 'no-such-companion'
			})
		).toBe(403);
	});
});
