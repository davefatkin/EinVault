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

	test('/api/openapi.json documents query/path params and a seeded log example', async ({
		app,
		page
	}) => {
		const res = await page.request.get(app.server.baseURL + '/api/openapi.json');
		const doc = await res.json();

		// Every paginated GET declares its query params so the docs can render inputs.
		const logsGet = doc.paths['/api/logs'].get.parameters ?? [];
		const names = logsGet.map((p: { name: string; in: string }) => `${p.in}:${p.name}`);
		expect(names).toEqual(
			expect.arrayContaining(['query:companionId', 'query:date', 'query:limit', 'query:offset'])
		);
		expect(logsGet.find((p: { name: string }) => p.name === 'companionId')?.required).toBe(true);

		// Path params are declared too (drive the Try-It URL substitution).
		const completeParams = doc.paths['/api/reminders/{id}/complete'].post.parameters ?? [];
		expect(
			completeParams.some((p: { name: string; in: string }) => p.in === 'path' && p.name === 'id')
		).toBe(true);

		// POST /api/logs seeds a body with a target companion (companionId/companionIds
		// are both optional, so the generic example builder would otherwise omit them).
		expect(doc.components.schemas.LogRequest.example).toHaveProperty('companionId');

		// Subtitle reflects the full surface, not just logging.
		expect(doc.info.description).toMatch(/health and weight/i);
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

	test('/api/docs documents params and lets a GET take companionId input', async ({
		app,
		page
	}) => {
		await page.goto(app.server.baseURL + '/api/docs');
		// Full-surface subtitle.
		await expect(page.getByText(/health and weight/i).first()).toBeVisible({ timeout: 8_000 });
		// Params doc table (rendered unconditionally) shows the companionId hint.
		await expect(page.getByText('Parameters').first()).toBeVisible();
		await expect(page.getByText('Required target companion.').first()).toBeVisible();

		// Opening a GET's Try-It reveals an editable input per param (path/query).
		const logsGet = page.locator('article', { hasText: 'Read back logged daily events' });
		await logsGet.getByText('Try it').click();
		await expect(logsGet.getByPlaceholder('Required target companion.')).toBeVisible();
		await expect(logsGet.getByPlaceholder('1-200, default 50.')).toBeVisible();
	});
});
