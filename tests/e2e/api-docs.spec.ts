import { test, expect } from '../lib/fixtures';

// /api/docs and /api/openapi.json are unauthenticated reads, gated only by the
// API_TOKENS_ENABLED killswitch (on by default) — no login/storageState needed.
test.describe('api docs', () => {
	test('/api/openapi.json lists the whole Bearer surface', async ({ app, page }) => {
		const res = await page.request.get(app.server.baseURL + '/api/openapi.json');
		expect(res.status()).toBe(200);
		const doc = await res.json();
		for (const p of [
			'/api/logs',
			'/api/journal',
			'/api/quick-logs',
			'/api/quick-logs/{id}/execute',
			'/api/companions'
		]) {
			expect(doc.paths).toHaveProperty(p);
		}
	});

	test('/api/docs renders the endpoints', async ({ app, page }) => {
		await page.goto(app.server.baseURL + '/api/docs');
		await expect(page.getByText('/api/logs', { exact: false }).first()).toBeVisible({
			timeout: 8_000
		});
		await expect(page.getByText('/api/journal', { exact: false }).first()).toBeVisible();
		await expect(page.getByText('/api/quick-logs', { exact: false }).first()).toBeVisible();
		await expect(page.getByText('/api/companions', { exact: false }).first()).toBeVisible();
	});
});
