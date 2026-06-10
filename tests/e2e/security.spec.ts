import { test, expect } from '../lib/fixtures';
import { SEED } from '../lib/seed';
import { pngUpload } from '../lib/files';

const BISCUIT = SEED.companions.biscuit.id;
const WAFFLES = SEED.companions.waffles.id;

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
		const res = await asCaretaker.request.get(`/api/companions/${BISCUIT}/documents`);
		expect(res.status()).toBe(403);
	});

	test('caretaker cannot read a photo for an unassigned companion', async ({
		asMember,
		asCaretaker
	}) => {
		// Upload a photo to Waffles (caretaker is only assigned to Biscuit)
		await asMember.goto(`/${WAFFLES}/journal/2026-06-03`);
		const fileInput = asMember.locator('input[type="file"][name="photos"]').first();
		await fileInput.setInputFiles(pngUpload());

		const photoImg = asMember.locator('img[src*="/api/photos/journal/"]').first();
		await expect(photoImg).toBeVisible({ timeout: 15_000 });

		const src = await photoImg.getAttribute('src');
		expect(src).toBeTruthy();

		// asCaretaker is not assigned to Waffles → 403
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
			`/api/companions/${WAFFLES}/journal/2026-06-04/photos`,
			{
				headers: { Origin: app.server.baseURL }, // SvelteKit CSRF check
				multipart: { photo: pngUpload() }
			}
		);
		expect(res.status()).toBe(403);
	});

	test('assigned caretaker can still upload a journal photo', async ({ app, asCaretaker }) => {
		// Guard must not over-tighten: caretaker IS assigned to Biscuit.
		const res = await asCaretaker.request.post(
			`/api/companions/${BISCUIT}/journal/2026-06-04/photos`,
			{
				headers: { Origin: app.server.baseURL },
				multipart: { photo: pngUpload() }
			}
		);
		expect(res.status()).toBe(200);
	});

	test('anonymous request to avatar endpoint returns 401', async ({ app, browser }) => {
		const ctx = await browser.newContext({ baseURL: app.server.baseURL });
		const res = await ctx.request.get(`/api/avatars/${BISCUIT}`);
		// Handler: if (!locals.user) error(401, ...)
		expect(res.status()).toBe(401);
		await ctx.close();
	});

	test('member cannot access caretaker shift calendar export', async ({ asMember }) => {
		// Handler: if (locals.user.role !== 'caretaker') error(403, ...)
		const res = await asMember.request.get('/api/shifts/export.ics');
		expect(res.status()).toBe(403);
	});
});
