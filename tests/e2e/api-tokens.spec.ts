import { test, expect } from '../lib/fixtures';

const EIN = 'seed-comp-ein';

// Creates a token via the settings UI and returns the raw value. Svelte sets
// input values as DOM properties (not attributes), so read via evaluate after
// the reveal-once alert renders.
async function createToken(
	page: import('@playwright/test').Page,
	name: string,
	settingsPath = '/settings'
): Promise<string> {
	await page.goto(settingsPath);
	await page.getByPlaceholder('e.g. Door button').fill(name);
	await page.getByRole('button', { name: 'Create token' }).click();
	await expect(page.getByText(/Copy this token now/)).toBeVisible({ timeout: 8_000 });
	const raw = await page.evaluate(() => {
		const els = Array.from(document.querySelectorAll<HTMLInputElement>('input[readonly]'));
		return els.find((el) => el.value.startsWith('evk_'))?.value ?? '';
	});
	expect(raw.startsWith('evk_')).toBe(true);
	return raw;
}

test.describe('api tokens', () => {
	test('create shows the raw token once; Bearer POST logs an event; revoke kills it', async ({
		asMember,
		app
	}) => {
		const raw = await createToken(asMember, 'Door button');

		// Reload → the raw value is gone (only the hash is stored).
		await asMember.reload();
		await expect(asMember.getByText(/Copy this token now/)).toHaveCount(0);
		await expect(asMember.getByText('Door button')).toBeVisible();

		// Headless POST /api/logs with the Bearer token creates an event.
		const res = await asMember.request.post(app.server.baseURL + '/api/logs', {
			headers: { Authorization: `Bearer ${raw}` },
			data: { companionId: EIN, type: 'walk', notes: 'e2e api walk', durationMinutes: 15 }
		});
		expect(res.status()).toBe(201);
		const body = await res.json();
		expect(body.ids).toHaveLength(1);

		// The event is visible in the UI.
		await asMember.goto(`/${EIN}/log`);
		await expect(asMember.getByText('e2e api walk')).toBeVisible();

		// Wrong token → 401.
		const bad = await asMember.request.post(app.server.baseURL + '/api/logs', {
			headers: { Authorization: 'Bearer evk_not-a-real-token' },
			data: { companionId: EIN, type: 'walk' }
		});
		expect(bad.status()).toBe(401);

		// Revoke via UI → token stops working.
		await asMember.goto('/settings');
		await asMember
			.locator('div')
			.filter({ hasText: 'Door button' })
			.getByRole('button', { name: 'Revoke' })
			.first()
			.click();
		await expect(asMember.getByText('Door button')).toHaveCount(0);

		const revoked = await asMember.request.post(app.server.baseURL + '/api/logs', {
			headers: { Authorization: `Bearer ${raw}` },
			data: { companionId: EIN, type: 'walk' }
		});
		expect(revoked.status()).toBe(401);
	});

	test('execute endpoint runs a configured quick log with an empty body', async ({
		asMember,
		app
	}) => {
		// Configure a quick log in the UI.
		await asMember.goto('/settings/quick-logs');
		await asMember.getByRole('button', { name: 'Add quick log' }).click();
		await asMember.locator('input[name="name"]').fill('Api treat');
		await asMember.locator('label').filter({ hasText: /Treat/i }).first().click();
		await asMember.getByRole('button', { name: 'Save', exact: true }).click();
		await expect(asMember.getByText('Api treat')).toBeVisible();

		const raw = await createToken(asMember, 'Button 2');

		// Device setup: discover the quick log id.
		const list = await asMember.request.get(app.server.baseURL + '/api/quick-logs', {
			headers: { Authorization: `Bearer ${raw}` }
		});
		expect(list.status()).toBe(200);
		const { quickLogs } = await list.json();
		const target = quickLogs.find((q: { name: string }) => q.name === 'Api treat');
		expect(target).toBeTruthy();

		// Fire it with no body; all config lives in the app.
		const exec = await asMember.request.post(
			app.server.baseURL + `/api/quick-logs/${target.id}/execute`,
			{ headers: { Authorization: `Bearer ${raw}` } }
		);
		expect(exec.status()).toBe(201);
		const { ids } = await exec.json();
		expect(ids.length).toBeGreaterThan(0);

		// Unknown id → 404 (no existence leak).
		const nope = await asMember.request.post(
			app.server.baseURL + '/api/quick-logs/does-not-exist/execute',
			{ headers: { Authorization: `Bearer ${raw}` } }
		);
		expect(nope.status()).toBe(404);
	});

	test('companions endpoint lists targetable companions with a safe shape', async ({
		asMember,
		app
	}) => {
		const raw = await createToken(asMember, 'Discovery bot');

		const res = await asMember.request.get(app.server.baseURL + '/api/companions', {
			headers: { Authorization: `Bearer ${raw}` }
		});
		expect(res.status()).toBe(200);
		const { companions } = await res.json();

		const ein = companions.find((c: { id: string }) => c.id === EIN);
		expect(ein).toBeTruthy();
		// Full profile is returned…
		expect(ein.name).toBeTruthy();
		expect(ein).toHaveProperty('vetName');
		// …but internal avatar storage plumbing is not leaked (and /api/avatars
		// is session-gated, so a token holder couldn't fetch it anyway).
		expect(ein).not.toHaveProperty('avatarStorageKey');
		expect(ein).not.toHaveProperty('avatarPath');
		expect(ein).not.toHaveProperty('avatarProvider');
		expect(ein).not.toHaveProperty('avatarUrl');
	});

	test('idempotency key makes a retried log a no-op; read-back returns events', async ({
		asMember,
		app
	}) => {
		const raw = await createToken(asMember, 'Idem bot');
		const headers = { Authorization: `Bearer ${raw}`, 'Idempotency-Key': 'walk-2026-07-03-08' };

		const first = await asMember.request.post(app.server.baseURL + '/api/logs', {
			headers,
			data: { companionId: EIN, type: 'walk', notes: 'idem walk' }
		});
		expect(first.status()).toBe(201);
		const firstBody = await first.json();

		// Same key + same body → replayed, no second event.
		const retry = await asMember.request.post(app.server.baseURL + '/api/logs', {
			headers,
			data: { companionId: EIN, type: 'walk', notes: 'idem walk' }
		});
		expect(retry.status()).toBe(201);
		expect(await retry.json()).toEqual(firstBody);

		// Same key + different body → 409.
		const clash = await asMember.request.post(app.server.baseURL + '/api/logs', {
			headers,
			data: { companionId: EIN, type: 'meal' }
		});
		expect(clash.status()).toBe(409);
		expect((await clash.json()).code).toBe('idempotencyKeyReused');

		// Read-back returns exactly one 'idem walk' event for the companion.
		const readBack = await asMember.request.get(
			app.server.baseURL + `/api/logs?companionId=${EIN}`,
			{ headers: { Authorization: `Bearer ${raw}` } }
		);
		expect(readBack.status()).toBe(200);
		const { events } = await readBack.json();
		expect(events.filter((e: { notes: string | null }) => e.notes === 'idem walk')).toHaveLength(1);
	});

	test('journal endpoint upserts the day entry', async ({ asMember, app }) => {
		const raw = await createToken(asMember, 'Journal bot');

		const res = await asMember.request.post(app.server.baseURL + '/api/journal', {
			headers: { Authorization: `Bearer ${raw}` },
			data: { companionId: EIN, body: 'e2e api journal', mood: 'good' }
		});
		expect(res.status()).toBe(201);

		const { date } = await res.json();
		await asMember.goto(`/${EIN}/journal/${date}`);
		await expect(asMember.locator('textarea').first()).toHaveValue('e2e api journal');
	});

	test('oversized note and journal body are rejected before storage', async ({ asMember, app }) => {
		const raw = await createToken(asMember, 'Length bot');
		const headers = { Authorization: `Bearer ${raw}` };

		const longNote = 'x'.repeat(5001);
		const noteRes = await asMember.request.post(app.server.baseURL + '/api/logs', {
			headers,
			data: { companionId: EIN, type: 'walk', notes: longNote }
		});
		expect(noteRes.status()).toBe(400);
		expect((await noteRes.json()).code).toBe('noteTooLong');

		const longBody = 'y'.repeat(20001);
		const journalRes = await asMember.request.post(app.server.baseURL + '/api/journal', {
			headers,
			data: { companionId: EIN, body: longBody }
		});
		expect(journalRes.status()).toBe(400);
		expect((await journalRes.json()).code).toBe('journalTooLong');
	});

	test('caretaker token may write today’s journal but not a past date', async ({
		asCaretaker,
		app
	}) => {
		const raw = await createToken(asCaretaker, 'Care journal bot', '/care/settings');
		const headers = { Authorization: `Bearer ${raw}` };

		// Today's entry is allowed (caretaker is on shift and assigned to Ein).
		const today = await asCaretaker.request.post(app.server.baseURL + '/api/journal', {
			headers,
			data: { companionId: EIN, body: 'care journal today' }
		});
		expect(today.status()).toBe(201);

		// A past date is forbidden, matching the web editor's today-only lock.
		const past = await asCaretaker.request.post(app.server.baseURL + '/api/journal', {
			headers,
			data: { companionId: EIN, date: '2020-01-01', body: 'backdated' }
		});
		expect(past.status()).toBe(403);
		expect((await past.json()).code).toBe('forbidden');
	});

	test('admin revokes a member’s API access; tokens 401 until re-granted', async ({
		asMember,
		asAdmin,
		app
	}) => {
		const raw = await createToken(asMember, 'Access test');

		// Sanity: token works.
		const ok = await asMember.request.post(app.server.baseURL + '/api/logs', {
			headers: { Authorization: `Bearer ${raw}` },
			data: { companionId: EIN, type: 'play' }
		});
		expect(ok.status()).toBe(201);

		// Admin revokes API access for the member (jet) via the users Manage drawer.
		await asAdmin.goto('/admin/users');
		const row = asAdmin.locator('div.px-6.py-4').filter({ hasText: 'jet' });
		await expect(row).toBeVisible({ timeout: 6_000 });
		await row.getByRole('button', { name: /manage/i }).click();
		await asAdmin.getByRole('button', { name: 'Revoke API access' }).click();
		await expect(asAdmin.getByRole('button', { name: 'Grant API access' })).toBeVisible();

		// Existing token now 401s…
		const blocked = await asMember.request.post(app.server.baseURL + '/api/logs', {
			headers: { Authorization: `Bearer ${raw}` },
			data: { companionId: EIN, type: 'play' }
		});
		expect(blocked.status()).toBe(401);

		// …and the member's settings card shows the revoked notice.
		await asMember.goto('/settings');
		await expect(asMember.getByText(/revoked your API access/)).toBeVisible();

		// A grant/revoke notification email reached the fake SMTP sink if the
		// member has an email configured; the seeded member may not, so we only
		// assert the toggle round-trip here (notification path is unit-adjacent).

		// Re-grant restores the token without recreating it.
		await asAdmin.getByRole('button', { name: 'Grant API access' }).click();
		await expect(asAdmin.getByRole('button', { name: 'Revoke API access' })).toBeVisible();

		const restored = await asMember.request.post(app.server.baseURL + '/api/logs', {
			headers: { Authorization: `Bearer ${raw}` },
			data: { companionId: EIN, type: 'play' }
		});
		expect(restored.status()).toBe(201);
	});
});
