import { test as base } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { test, expect } from '../lib/fixtures';
import { createSeededDbNoShift, SEED } from '../lib/seed';
import { startAppServer, type AppServer } from '../lib/app-server';
import { getFreePort } from '../lib/ports';

const EIN = 'seed-comp-ein';
const REPO_ROOT = path.resolve(import.meta.dirname, '../..');

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

	test('companion detail endpoint returns full or minimal projection; unknown id is 404', async ({
		asMember,
		app
	}) => {
		const raw = await createToken(asMember, 'Detail bot');

		const res = await asMember.request.get(app.server.baseURL + `/api/companions/${EIN}`, {
			headers: { Authorization: `Bearer ${raw}` }
		});
		expect(res.status()).toBe(200);
		const { companion } = await res.json();
		expect(companion.id).toBe(EIN);
		// Full-scope: PII field present (may be null, but the key must exist).
		expect(companion).toHaveProperty('microchip');

		// Write-scope token gets the minimal projection, same as the list endpoint.
		const writeRaw = await createToken(asMember, 'Detail write bot', '/settings', 'write');
		const writeRes = await asMember.request.get(app.server.baseURL + `/api/companions/${EIN}`, {
			headers: { Authorization: `Bearer ${writeRaw}` }
		});
		expect(writeRes.status()).toBe(200);
		const { companion: minimal } = await writeRes.json();
		expect(minimal.id).toBe(EIN);
		expect(minimal.name).toBeTruthy();
		expect(minimal.species).toBeTruthy();
		expect(typeof minimal.isActive).toBe('boolean');
		expect(minimal).not.toHaveProperty('microchip');

		// Unknown id → 404, no enumeration oracle.
		const missing = await asMember.request.get(
			app.server.baseURL + '/api/companions/does-not-exist',
			{ headers: { Authorization: `Bearer ${raw}` } }
		);
		expect(missing.status()).toBe(404);
		expect((await missing.json()).code).toBe('notFound');
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

		// An otherwise-valid body carrying an unknown key is rejected outright
		// (schema is .strict()), not silently accepted with the extra key ignored.
		const bogusKey = await asMember.request.post(app.server.baseURL + '/api/weight', {
			headers,
			data: { companionId: EIN, weight: 5, unit: 'kg', bogusField: 1 }
		});
		expect(bogusKey.status()).toBe(400);
		expect((await bogusKey.json()).code).toBe('invalidBody');

		const writeRaw = await createToken(asMember, 'Scale write bot', '/settings', 'write');
		const writeGet = await asMember.request.get(
			app.server.baseURL + `/api/weight?companionId=${EIN}`,
			{ headers: { Authorization: `Bearer ${writeRaw}` } }
		);
		expect(writeGet.status()).toBe(403);
		expect((await writeGet.json()).code).toBe('writeScopeReadOnly');
	});

	test('reminders endpoint lists due reminders by default and all with status=all', async ({
		asMember,
		app
	}) => {
		const raw = await createToken(asMember, 'Reminder bot');
		const headers = { Authorization: `Bearer ${raw}` };

		// Default status=due: every returned reminder is not yet completed.
		const due = await asMember.request.get(
			app.server.baseURL + `/api/reminders?companionId=${EIN}`,
			{ headers }
		);
		expect(due.status()).toBe(200);
		const { reminders: dueReminders } = await due.json();
		expect(Array.isArray(dueReminders)).toBe(true);
		for (const reminder of dueReminders) {
			expect(reminder.completedAt).toBeNull();
		}

		// status=all may additionally include completed reminders.
		const all = await asMember.request.get(
			app.server.baseURL + `/api/reminders?companionId=${EIN}&status=all`,
			{ headers }
		);
		expect(all.status()).toBe(200);
		expect(Array.isArray((await all.json()).reminders)).toBe(true);

		// No companionId: lists across every companion the token user may access.
		const allCompanions = await asMember.request.get(app.server.baseURL + '/api/reminders', {
			headers
		});
		expect(allCompanions.status()).toBe(200);
		expect(Array.isArray((await allCompanions.json()).reminders)).toBe(true);

		// Write-scope token cannot read reminders back.
		const writeRaw = await createToken(asMember, 'Reminder write bot', '/settings', 'write');
		const writeGet = await asMember.request.get(
			app.server.baseURL + `/api/reminders?companionId=${EIN}`,
			{ headers: { Authorization: `Bearer ${writeRaw}` } }
		);
		expect(writeGet.status()).toBe(403);
		expect((await writeGet.json()).code).toBe('writeScopeReadOnly');

		// Unknown status value is rejected with a stable code (spec declares an enum).
		const bogusStatus = await asMember.request.get(
			app.server.baseURL + `/api/reminders?companionId=${EIN}&status=bogus`,
			{ headers }
		);
		expect(bogusStatus.status()).toBe(400);
		expect((await bogusStatus.json()).code).toBe('invalidStatus');
	});

	test('complete endpoint marks a reminder done; guards double-complete and unknown ids', async ({
		asMember,
		app
	}) => {
		const raw = await createToken(asMember, 'Reminder complete bot');
		const headers = { Authorization: `Bearer ${raw}` };

		// There are no seeded incomplete reminders for EIN, so create one-off
		// reminders via the app's own form (same UI a member would use), then
		// discover their ids through the read endpoint under test above.
		async function addOneOffReminder(title: string) {
			await asMember.goto(`/${EIN}/reminders`);
			await asMember.getByRole('button', { name: 'Add Reminder' }).click();
			await asMember.locator('#title').fill(title);
			await asMember.locator('#dueAt').fill('2099-01-15T10:00');
			await asMember.getByRole('button', { name: 'Save Reminder' }).click();
			await expect(asMember.getByRole('button', { name: 'Save Reminder' })).toHaveCount(0, {
				timeout: 8_000
			});
		}

		async function findReminderId(title: string): Promise<string> {
			const res = await asMember.request.get(
				app.server.baseURL + `/api/reminders?companionId=${EIN}`,
				{ headers }
			);
			const { reminders } = await res.json();
			const match = reminders.find((r: { title: string }) => r.title === title);
			expect(match).toBeTruthy();
			return match.id;
		}

		await addOneOffReminder('Api complete one-off');
		const id = await findReminderId('Api complete one-off');

		const complete = await asMember.request.post(
			app.server.baseURL + `/api/reminders/${id}/complete`,
			{ headers }
		);
		expect(complete.status()).toBe(200);
		const body = await complete.json();
		expect(body.id).toBe(id);
		expect(body.completedAt).toBeTruthy();
		expect(body.nextReminderId).toBeNull();

		// Completing the same (now-completed) reminder again → 409.
		const again = await asMember.request.post(
			app.server.baseURL + `/api/reminders/${id}/complete`,
			{ headers }
		);
		expect(again.status()).toBe(409);
		expect((await again.json()).code).toBe('alreadyCompleted');

		// Unknown id → 404, same shape as the not-owned case (no enumeration oracle).
		const unknown = await asMember.request.post(
			app.server.baseURL + '/api/reminders/does-not-exist/complete',
			{ headers }
		);
		expect(unknown.status()).toBe(404);
		expect((await unknown.json()).code).toBe('notFound');

		// A write-scope token may still complete — complete is a write. Uses a
		// fresh reminder since the first is now completed.
		await addOneOffReminder('Api complete write-scope');
		const secondId = await findReminderId('Api complete write-scope');
		const writeRaw = await createToken(
			asMember,
			'Reminder complete write bot',
			'/settings',
			'write'
		);
		const writeComplete = await asMember.request.post(
			app.server.baseURL + `/api/reminders/${secondId}/complete`,
			{ headers: { Authorization: `Bearer ${writeRaw}` } }
		);
		expect(writeComplete.status()).toBe(200);
	});

	test('complete endpoint spawns the next occurrence for a recurring reminder', async ({
		asMember,
		app
	}) => {
		const raw = await createToken(asMember, 'Reminder recurring bot');
		const headers = { Authorization: `Bearer ${raw}` };

		// Create a recurring reminder via the app's own form (same UI a member
		// would use), then discover its id through the read endpoint.
		await asMember.goto(`/${EIN}/reminders`);
		await asMember.getByRole('button', { name: 'Add Reminder' }).click();
		await asMember.locator('#title').fill('Api complete recurring');
		await asMember.locator('#dueAt').fill('2099-01-15T10:00');
		await asMember.locator('#add-isRecurring').check();
		await asMember.locator('#add-recurrenceInterval').fill('1');
		await asMember.locator('select[name="recurrenceUnit"]').selectOption('day');
		await asMember.getByRole('button', { name: 'Save Reminder' }).click();
		await expect(asMember.getByRole('button', { name: 'Save Reminder' })).toHaveCount(0, {
			timeout: 8_000
		});

		const listRes = await asMember.request.get(
			app.server.baseURL + `/api/reminders?companionId=${EIN}`,
			{ headers }
		);
		const { reminders } = await listRes.json();
		const match = reminders.find((r: { title: string }) => r.title === 'Api complete recurring');
		expect(match).toBeTruthy();
		const id = match.id;

		const done = await asMember.request.post(app.server.baseURL + `/api/reminders/${id}/complete`, {
			headers
		});
		expect(done.status()).toBe(200);
		const body = await done.json();
		expect(typeof body.nextReminderId).toBe('string'); // spawned the next occurrence

		// The spawned occurrence shows up in a fresh due-list read.
		const after = await asMember.request.get(
			app.server.baseURL + `/api/reminders?companionId=${EIN}`,
			{ headers }
		);
		const ids = (await after.json()).reminders.map((r: { id: string }) => r.id);
		expect(ids).toContain(body.nextReminderId);
	});

	test('shifts endpoint: admin sees all, caretaker sees only their own, write-scope is forbidden', async ({
		asAdmin,
		asCaretaker,
		app
	}) => {
		// Admin (full scope): the caretaker's active seeded shift is visible.
		const adminRaw = await createToken(asAdmin, 'Shift admin bot', '/settings');
		const adminRes = await asAdmin.request.get(app.server.baseURL + '/api/shifts', {
			headers: { Authorization: `Bearer ${adminRaw}` }
		});
		expect(adminRes.status()).toBe(200);
		const { shifts: adminShifts } = await adminRes.json();
		expect(Array.isArray(adminShifts)).toBe(true);
		expect(adminShifts.some((s: { userId: string }) => s.userId === SEED.caretaker.id)).toBe(true);

		// Caretaker (full scope): every returned shift belongs to the caretaker
		// themselves — never another user's shift.
		const careRaw = await createToken(asCaretaker, 'Shift care bot', '/care/settings');
		const careRes = await asCaretaker.request.get(app.server.baseURL + '/api/shifts', {
			headers: { Authorization: `Bearer ${careRaw}` }
		});
		expect(careRes.status()).toBe(200);
		const { shifts: careShifts } = await careRes.json();
		expect(Array.isArray(careShifts)).toBe(true);
		expect(careShifts.length).toBeGreaterThan(0);
		for (const shift of careShifts) {
			expect(shift.userId).toBe(SEED.caretaker.id);
		}

		// Write-scope token cannot read shifts back.
		const writeRaw = await createToken(asAdmin, 'Shift write bot', '/settings', 'write');
		const writeRes = await asAdmin.request.get(app.server.baseURL + '/api/shifts', {
			headers: { Authorization: `Bearer ${writeRaw}` }
		});
		expect(writeRes.status()).toBe(403);
		expect((await writeRes.json()).code).toBe('writeScopeReadOnly');
	});

	test('users endpoint: admin sees everyone, member excludes admins, caretaker sees only self', async ({
		asAdmin,
		asMember,
		asCaretaker,
		app
	}) => {
		// Admin (full scope): the whole roster, including the admin and the caretaker.
		const adminRaw = await createToken(asAdmin, 'Users admin bot', '/settings');
		const adminRes = await asAdmin.request.get(app.server.baseURL + '/api/users', {
			headers: { Authorization: `Bearer ${adminRaw}` }
		});
		expect(adminRes.status()).toBe(200);
		const { users: adminUsers } = await adminRes.json();
		expect(Array.isArray(adminUsers)).toBe(true);
		expect(adminUsers.some((u: { role: string }) => u.role === 'admin')).toBe(true);
		expect(adminUsers.some((u: { role: string }) => u.role === 'caretaker')).toBe(true);

		// Belt-and-suspenders leakage guard: no sensitive column ever reaches the
		// wire, independent of the toApiUser drift test.
		for (const u of adminUsers) {
			expect(u).not.toHaveProperty('passwordHash');
			expect(u).not.toHaveProperty('email');
			expect(u).not.toHaveProperty('totpSecret');
			expect(u).not.toHaveProperty('phone');
		}
		// Admin keeps the full roster, including usernames.
		expect(adminUsers.every((u: { username?: string }) => typeof u.username === 'string')).toBe(
			true
		);

		// Member (full scope): everyone except admins, and no `username` (the
		// login identifier) on any row — a member gets the reduced
		// toApiUserPublic shape.
		const memberRaw = await createToken(asMember, 'Users member bot', '/settings');
		const memberRes = await asMember.request.get(app.server.baseURL + '/api/users', {
			headers: { Authorization: `Bearer ${memberRaw}` }
		});
		expect(memberRes.status()).toBe(200);
		const { users: memberUsers } = await memberRes.json();
		expect(Array.isArray(memberUsers)).toBe(true);
		expect(memberUsers.length).toBeGreaterThan(0);
		expect(memberUsers.some((u: { role: string }) => u.role === 'admin')).toBe(false);
		for (const u of memberUsers) {
			expect(u.username).toBeUndefined();
			expect(typeof u.displayName).toBe('string');
		}

		// Caretaker (full scope): exactly one entry, themselves, and their own
		// username is still present (only members lose it).
		const careRaw = await createToken(asCaretaker, 'Users care bot', '/care/settings');
		const careRes = await asCaretaker.request.get(app.server.baseURL + '/api/users', {
			headers: { Authorization: `Bearer ${careRaw}` }
		});
		expect(careRes.status()).toBe(200);
		const { users: careUsers } = await careRes.json();
		expect(careUsers).toHaveLength(1);
		expect(careUsers[0].id).toBe(SEED.caretaker.id);
		expect(typeof careUsers[0].username).toBe('string');

		// Write-scope token cannot read users back.
		const writeRaw = await createToken(asAdmin, 'Users write bot', '/settings', 'write');
		const writeRes = await asAdmin.request.get(app.server.baseURL + '/api/users', {
			headers: { Authorization: `Bearer ${writeRaw}` }
		});
		expect(writeRes.status()).toBe(403);
		expect((await writeRes.json()).code).toBe('writeScopeReadOnly');
	});

	test('users endpoint paginates with limit/offset and rejects invalid pagination', async ({
		asAdmin,
		app
	}) => {
		const adminRaw = await createToken(asAdmin, 'Users pagination bot', '/settings');
		const get = (query: string) =>
			asAdmin.request.get(app.server.baseURL + `/api/users${query}`, {
				headers: { Authorization: `Bearer ${adminRaw}` }
			});

		const limited = await get('?limit=1');
		expect(limited.status()).toBe(200);
		const limitedBody = await limited.json();
		expect(limitedBody.users).toHaveLength(1);
		expect(limitedBody.hasMore).toBe(true);

		const full = await get('?limit=200');
		expect(full.status()).toBe(200);
		expect((await full.json()).hasMore).toBe(false);

		const zero = await get('?limit=0');
		expect(zero.status()).toBe(400);
		expect((await zero.json()).code).toBe('invalidPagination');

		const nonNumeric = await get('?limit=abc');
		expect(nonNumeric.status()).toBe(400);
		expect((await nonNumeric.json()).code).toBe('invalidPagination');
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

// ---------------------------------------------------------------------------
// Off-shift caretaker reminder-complete: dedicated per-test server with no
// active shift (the shared worker's asCaretaker fixture is always on-shift).
// ---------------------------------------------------------------------------

interface OffShiftWorld {
	server: AppServer;
}

const offShiftTest = base.extend<{ world: OffShiftWorld }>({
	// eslint-disable-next-line no-empty-pattern
	world: async ({}, use, testInfo) => {
		const dir = path.join(
			REPO_ROOT,
			'.test-data',
			`api-tokens-offshift-${testInfo.workerIndex}-${testInfo.testId}`
		);
		const appPort = await getFreePort();
		const dbPath = createSeededDbNoShift(dir);
		let server: AppServer;
		try {
			server = await startAppServer({ dbPath, env: { PORT: String(appPort) } });
		} catch (err) {
			fs.rmSync(dir, { recursive: true, force: true });
			throw err;
		}
		await use({ server });
		await server.stop();
		fs.rmSync(dir, { recursive: true, force: true });
	}
});

offShiftTest(
	'off-shift caretaker: completing a reminder on an unassigned companion is 404, not 403',
	async ({ world, browser }) => {
		const ctx = await browser.newContext({ baseURL: world.server.baseURL });
		const page = await ctx.newPage();
		await page.goto('/auth/login');
		await page.getByLabel('Username').fill(SEED.caretaker.username);
		await page.getByLabel('Password').fill(SEED.password);
		await page.getByRole('button', { name: 'Sign in' }).click();
		await expect(page.getByLabel('Username')).toHaveCount(0, { timeout: 10_000 });

		const raw = await createToken(page, 'Offshift complete bot', '/care/settings');
		const headers = { Authorization: `Bearer ${raw}` };

		// The caretaker (faye) is off-shift on this server and is assigned only to
		// Ein, never to Edward. seed-reminder-4 belongs to Edward and isn't
		// completed, so this exercises the assignment-only pre-check: it must read
		// as 404 (not the 403 noActiveShift an off-shift caretaker would otherwise
		// get for ANY existing reminder id — which would let a token distinguish
		// "exists" from "unknown" without ever being assigned to the companion).
		const unassigned = await page.request.post(
			world.server.baseURL + '/api/reminders/seed-reminder-4/complete',
			{ headers }
		);
		expect(unassigned.status()).toBe(404);
		expect((await unassigned.json()).code).toBe('notFound');

		// Defense-in-depth check: a reminder on the companion the caretaker IS
		// assigned to (Ein) still passes the assignment pre-check and reaches the
		// real 403 noActiveShift — the fix must not over-mask a genuine shift error.
		const assigned = await page.request.post(
			world.server.baseURL + '/api/reminders/seed-reminder-1/complete',
			{ headers }
		);
		expect(assigned.status()).toBe(403);
		expect((await assigned.json()).code).toBe('noActiveShift');

		await ctx.close();
	}
);
