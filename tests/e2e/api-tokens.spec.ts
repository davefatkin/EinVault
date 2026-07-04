import { test, expect } from '../lib/fixtures';

const EIN = 'seed-comp-ein';

// Creates a token via the settings UI and returns the raw value. Svelte sets
// input values as DOM properties (not attributes), so read via evaluate after
// the reveal-once alert renders.
async function createToken(
	page: import('@playwright/test').Page,
	name: string,
	settingsPath = '/settings',
	scope: 'full' | 'write' = 'full'
): Promise<string> {
	await page.goto(settingsPath);
	await page.getByPlaceholder('e.g. Door button').fill(name);
	if (scope === 'write') await page.locator('#api-token-scope').selectOption('write');
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
		// Auth failures carry the stable envelope code, same as validation errors.
		expect((await bad.json()).code).toBe('invalidToken');

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

	test('write-only token: minimal companion shape, writes but cannot read back', async ({
		asMember,
		app
	}) => {
		const raw = await createToken(asMember, 'Write only bot', '/settings', 'write');
		const headers = { Authorization: `Bearer ${raw}` };

		// Companion discovery returns the minimal shape (no PII).
		const comps = await asMember.request.get(app.server.baseURL + '/api/companions', { headers });
		expect(comps.status()).toBe(200);
		const ein = (await comps.json()).companions.find((c: { id: string }) => c.id === EIN);
		expect(ein).toBeTruthy();
		expect(ein.name).toBeTruthy();
		expect(ein).not.toHaveProperty('vetName');
		expect(ein).not.toHaveProperty('microchip');

		// It can still write.
		const post = await asMember.request.post(app.server.baseURL + '/api/logs', {
			headers,
			data: { companionId: EIN, type: 'walk', notes: 'write-scope walk' }
		});
		expect(post.status()).toBe(201);

		// But read-back of notes and journal bodies is forbidden.
		const getLogs = await asMember.request.get(
			app.server.baseURL + `/api/logs?companionId=${EIN}`,
			{ headers }
		);
		expect(getLogs.status()).toBe(403);
		expect((await getLogs.json()).code).toBe('writeScopeReadOnly');

		const getJournal = await asMember.request.get(
			app.server.baseURL + `/api/journal?companionId=${EIN}`,
			{ headers }
		);
		expect(getJournal.status()).toBe(403);
		expect((await getJournal.json()).code).toBe('writeScopeReadOnly');
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

		const durationRes = await asMember.request.post(app.server.baseURL + '/api/logs', {
			headers,
			data: { companionId: EIN, type: 'walk', durationMinutes: 600 }
		});
		expect(durationRes.status()).toBe(400);
		expect((await durationRes.json()).code).toBe('invalidDuration');

		const longBody = 'y'.repeat(20001);
		const journalRes = await asMember.request.post(app.server.baseURL + '/api/journal', {
			headers,
			data: { companionId: EIN, body: longBody }
		});
		expect(journalRes.status()).toBe(400);
		expect((await journalRes.json()).code).toBe('journalTooLong');

		// A present-but-wrong-typed mood is a client bug: still rejected with a stable code.
		const badMood = await asMember.request.post(app.server.baseURL + '/api/journal', {
			headers,
			data: { companionId: EIN, mood: 42 }
		});
		expect(badMood.status()).toBe(400);
		expect((await badMood.json()).code).toBe('invalidMood');

		// A well-typed but unrecognized mood value is also rejected with the same code.
		const unrecognizedMood = await asMember.request.post(app.server.baseURL + '/api/journal', {
			headers,
			data: { companionId: EIN, mood: 'excited' }
		});
		expect(unrecognizedMood.status()).toBe(400);
		expect((await unrecognizedMood.json()).code).toBe('invalidMood');
	});

	test('loggedAt accepts full ISO 8601 and rejects garbage with a stable code', async ({
		asMember,
		app
	}) => {
		const raw = await createToken(asMember, 'Timestamp bot');
		const headers = { Authorization: `Bearer ${raw}` };

		// Offset-form ISO 8601 (not the bare `Z`-suffixed form) is accepted —
		// the schema only checks it's a string; parseLoggedAt is the real judge.
		const offsetForm = new Date(Date.now() - 3_600_000).toISOString().replace('Z', '+00:00');
		const okRes = await asMember.request.post(app.server.baseURL + '/api/logs', {
			headers,
			data: { companionId: EIN, type: 'walk', loggedAt: offsetForm }
		});
		expect(okRes.status()).toBe(201);

		// Garbage is rejected with the stable invalidLoggedAt code, not a 200
		// silently logged at "now" and not the generic invalidBody code.
		const badTs = await asMember.request.post(app.server.baseURL + '/api/logs', {
			headers,
			data: { companionId: EIN, type: 'walk', loggedAt: 'not-a-date' }
		});
		expect(badTs.status()).toBe(400);
		expect((await badTs.json()).code).toBe('invalidLoggedAt');
	});

	test('health endpoint creates and reads back an event; validates type/title/occurredAt', async ({
		asMember,
		app
	}) => {
		const raw = await createToken(asMember, 'Health bot');
		const headers = { Authorization: `Bearer ${raw}` };

		const res = await asMember.request.post(app.server.baseURL + '/api/health-events', {
			headers,
			data: {
				companionId: EIN,
				type: 'vet_visit',
				title: 'Annual',
				occurredAt: '2019-05-01T09:00:00Z'
			}
		});
		expect(res.status()).toBe(201);
		const { id } = await res.json();
		expect(id).toBeTruthy();

		// Read back by date filter rather than events[0]: the seed data already
		// carries a more recent health event for EIN (see demo-seed.ts), so a
		// historical 2019 record won't sort first in the unfiltered list.
		const readBack = await asMember.request.get(
			app.server.baseURL + `/api/health-events?companionId=${EIN}&date=2019-05-01`,
			{ headers }
		);
		expect(readBack.status()).toBe(200);
		const { events } = await readBack.json();
		expect(events).toHaveLength(1);
		expect(events[0].id).toBe(id);
		expect(events[0].title).toBe('Annual');

		const badType = await asMember.request.post(app.server.baseURL + '/api/health-events', {
			headers,
			data: { companionId: EIN, type: 'nope', title: 'x' }
		});
		expect(badType.status()).toBe(400);
		expect((await badType.json()).code).toBe('invalidType');

		const emptyTitle = await asMember.request.post(app.server.baseURL + '/api/health-events', {
			headers,
			data: { companionId: EIN, type: 'other', title: '' }
		});
		expect(emptyTitle.status()).toBe(400);
		expect((await emptyTitle.json()).code).toBe('titleRequired');

		// An absent title (vs. an empty one) must yield the same stable code,
		// not fall through to the generic invalidBody.
		const missingTitle = await asMember.request.post(app.server.baseURL + '/api/health-events', {
			headers,
			data: { companionId: EIN, type: 'other' }
		});
		expect(missingTitle.status()).toBe(400);
		expect((await missingTitle.json()).code).toBe('titleRequired');

		const badOccurredAt = await asMember.request.post(app.server.baseURL + '/api/health-events', {
			headers,
			data: { companionId: EIN, type: 'other', title: 'x', occurredAt: 'not-a-date' }
		});
		expect(badOccurredAt.status()).toBe(400);
		expect((await badOccurredAt.json()).code).toBe('invalidOccurredAt');

		const writeRaw = await createToken(asMember, 'Health write bot', '/settings', 'write');
		const writeGet = await asMember.request.get(
			app.server.baseURL + `/api/health-events?companionId=${EIN}`,
			{ headers: { Authorization: `Bearer ${writeRaw}` } }
		);
		expect(writeGet.status()).toBe(403);
		expect((await writeGet.json()).code).toBe('writeScopeReadOnly');
	});

	test('weight endpoint creates and reads back an entry; validates weight/unit/recordedAt', async ({
		asMember,
		app
	}) => {
		const raw = await createToken(asMember, 'Scale bot');
		const headers = { Authorization: `Bearer ${raw}` };

		const res = await asMember.request.post(app.server.baseURL + '/api/weight', {
			headers,
			data: { companionId: EIN, weight: 12.4, unit: 'kg', recordedAt: '2020-01-01T00:00:00Z' }
		});
		expect(res.status()).toBe(201);
		const { id } = await res.json();
		expect(id).toBeTruthy();

		const readBack = await asMember.request.get(
			app.server.baseURL + `/api/weight?companionId=${EIN}`,
			{ headers }
		);
		expect(readBack.status()).toBe(200);
		// Find by id rather than assume entries[0]: /api/weight has no date
		// filter (unlike /api/health-events), and the seed data already
		// carries more recent weight entries for EIN (see demo-seed.ts) that
		// sort ahead of our historical 2020-01-01 record.
		const { entries } = await readBack.json();
		const created = entries.find((e: { id: string }) => e.id === id);
		expect(created?.weight).toBe(12.4);

		const badWeight = await asMember.request.post(app.server.baseURL + '/api/weight', {
			headers,
			data: { companionId: EIN, weight: -3, unit: 'kg' }
		});
		expect(badWeight.status()).toBe(400);
		expect((await badWeight.json()).code).toBe('invalidWeight');

		const badUnit = await asMember.request.post(app.server.baseURL + '/api/weight', {
			headers,
			data: { companionId: EIN, weight: 5, unit: 'stone' }
		});
		expect(badUnit.status()).toBe(400);
		expect((await badUnit.json()).code).toBe('invalidUnit');

		const badRecordedAt = await asMember.request.post(app.server.baseURL + '/api/weight', {
			headers,
			data: { companionId: EIN, weight: 5, unit: 'kg', recordedAt: 'not-a-date' }
		});
		expect(badRecordedAt.status()).toBe(400);
		expect((await badRecordedAt.json()).code).toBe('invalidRecordedAt');

		const writeRaw = await createToken(asMember, 'Scale write bot', '/settings', 'write');
		const writeGet = await asMember.request.get(
			app.server.baseURL + `/api/weight?companionId=${EIN}`,
			{ headers: { Authorization: `Bearer ${writeRaw}` } }
		);
		expect(writeGet.status()).toBe(403);
		expect((await writeGet.json()).code).toBe('writeScopeReadOnly');
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

	test('caretaker token may write a health event for an assigned, on-shift companion', async ({
		asCaretaker,
		app
	}) => {
		const raw = await createToken(asCaretaker, 'Care health bot', '/care/settings');

		const res = await asCaretaker.request.post(app.server.baseURL + '/api/health-events', {
			headers: { Authorization: `Bearer ${raw}` },
			data: { companionId: EIN, type: 'vet_visit', title: 'Shift checkup' }
		});
		expect(res.status()).toBe(201);
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
