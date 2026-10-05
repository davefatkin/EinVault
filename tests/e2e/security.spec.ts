import { test, expect } from '../lib/fixtures';
import { SEED } from '../lib/seed';
import { pngUpload } from '../lib/files';

const EIN = SEED.companions.ein.id;
const EDWARD = SEED.companions.edward.id;

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
			`/api/companions/${EDWARD}/journal/2026-06-04/photos`,
			{
				headers: { Origin: app.server.baseURL }, // SvelteKit CSRF check
				multipart: { photo: pngUpload() }
			}
		);
		expect(res.status()).toBe(403);
	});

	test('assigned caretaker can still upload a journal photo', async ({ app, asCaretaker }) => {
		// Guard must not over-tighten: caretaker IS assigned to Ein.
		const res = await asCaretaker.request.post(`/api/companions/${EIN}/journal/2026-06-04/photos`, {
			headers: { Origin: app.server.baseURL },
			multipart: { photo: pngUpload() }
		});
		expect(res.status()).toBe(200);
	});

	test('anonymous request to avatar endpoint returns 401', async ({ app, browser }) => {
		const ctx = await browser.newContext({ baseURL: app.server.baseURL });
		const res = await ctx.request.get(`/api/avatars/${EIN}`);
		// Handler: if (!locals.user) error(401, ...)
		expect(res.status()).toBe(401);
		await ctx.close();
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
